import { FastifyInstance } from "fastify";
import { LeaderboardService } from "./leaderboard.service.js";
import { enqueuePlayer } from "./matchmaking.worker.js";
import { redis } from "../config/redis.js";

const leaderboard = new LeaderboardService();

export async function gameArenaRoutes(app: FastifyInstance) {
  app.post("/arena/score", async (req) => {
    const { userId, mmr } = req.body as any;
    await leaderboard.updateScore(userId, mmr);
    return { ok: true };
  });

  app.get("/arena/leaderboard", async (req) => {
    const { limit = 20 } = req.query as { limit?: number };
    return leaderboard.getTopPlayers(Number(limit));
  });

  app.get("/arena/player/:userId", async (req, reply) => {
    const { userId } = req.params as { userId: string };
    const context = await leaderboard.getPlayerContext(userId);
    if (!context) return reply.code(404).send({ error: "Player not found" });
    return context;
  });

  app.post("/arena/matchmaking/join", async (req) => {
    const { userId, mmr, lon, lat } = req.body as any;
    await enqueuePlayer(userId, mmr, lon, lat);
    return { status: "QUEUED", userId };
  });

  // Bulk-simulate 100+ players joining the leaderboard and matchmaking queue across regions
  app.post("/arena/simulate-population", async (req) => {
    const { count = 120 } = (req.body as any) || {};
    const hubs = [
      { name: "EU-Central", lon: 8.6821, lat: 50.1109 },  // Frankfurt
      { name: "US-East", lon: -74.006, lat: 40.7128 },     // New York
      { name: "AP-South", lon: 72.8777, lat: 19.076 },     // Mumbai
    ];

    const pipeline = redis.pipeline();
    for (let i = 1; i <= count; i++) {
      const userId = `player_${i}`;
      const mmr = Math.floor(1100 + Math.random() * 1400);
      const hub = hubs[i % hubs.length];
      // Add slight coordinate jitter around each hub
      const lon = hub.lon + (Math.random() - 0.5) * 4;
      const lat = hub.lat + (Math.random() - 0.5) * 4;

      pipeline.zadd("leaderboard:global", mmr, userId);
      pipeline.geoadd("players:geo", lon, lat, userId);
      pipeline.zadd("matchmaking:queue", mmr, userId);
    }
    await pipeline.exec();

    return { ok: true, simulatedPlayers: count };
  });
}