import { PrismaClient } from "@prisma/client";
import { redis } from "../config/redis.js";
import crypto from "node:crypto";

const prisma = new PrismaClient();
const QUEUE_KEY = "matchmaking:queue";
const GEO_KEY = "players:geo";

export async function enqueuePlayer(userId: string, mmr: number, lon: number, lat: number) {
  await redis.pipeline()
    .geoadd(GEO_KEY, lon, lat, userId)
    .zadd(QUEUE_KEY, mmr, userId)
    .exec();
}

// Forms multi-player lobbies (e.g., 10 players per match) from 100+ queued players
export function startMatchmakingLoop(lobbySize = 10, maxMmrSpread = 250, maxRadiusKm = 2000) {
  setInterval(async () => {
    const totalQueued = await redis.zcard(QUEUE_KEY);
    if (totalQueued < lobbySize) return;

    // Fetch up to 100 waiting players sorted by MMR
    const raw = await redis.zrange(QUEUE_KEY, 0, 99, "WITHSCORES");
    const players: { userId: string; mmr: number }[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      players.push({ userId: raw[i], mmr: Number(raw[i + 1]) });
    }

    const matchedIds = new Set<string>();

    for (let i = 0; i < players.length; i++) {
      const anchor = players[i];
      if (matchedIds.has(anchor.userId)) continue;

      // Find all players within maxRadiusKm of the anchor player using Redis GEOSEARCH
      const nearbyUsers = (await redis.geosearch(
        GEO_KEY,
        "FROMMEMBER",
        anchor.userId,
        "BYRADIUS",
        maxRadiusKm,
        "km"
      )) as string[];

      const nearbySet = new Set(nearbyUsers);

      // Filter candidates who are queued, nearby, and within MMR skill bracket
      const candidates = players.filter(
        (p) =>
          !matchedIds.has(p.userId) &&
          nearbySet.has(p.userId) &&
          Math.abs(p.mmr - anchor.mmr) <= maxMmrSpread
      );

      if (candidates.length >= lobbySize) {
        const lobby = candidates.slice(0, lobbySize);
        const lobbyUserIds = lobby.map((p) => p.userId);

        // Atomically remove all matched players from the matchmaking queue
        const removedCount = await redis.zrem(QUEUE_KEY, ...lobbyUserIds);

        if (removedCount === lobbySize) {
          lobbyUserIds.forEach((id) => matchedIds.add(id));

          const avgMmr = Math.round(
            lobby.reduce((sum, p) => sum + p.mmr, 0) / lobbySize
          );
          const matchId = crypto.randomUUID();

          await prisma.matchHistory.create({
            data: {
              id: matchId,
              lobbySize,
              playersJson: JSON.stringify(lobbyUserIds),
              averageMmr: avgMmr,
              maxSpreadKm: maxRadiusKm,
            },
          });

          await redis.publish(
            "arena_events",
            JSON.stringify({
              type: "MATCH_FOUND",
              matchId,
              lobbySize,
              averageMmr: avgMmr,
              players: lobbyUserIds,
            })
          );
        }
      }
    }
  }, 500);
}