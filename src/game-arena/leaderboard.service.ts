import { redis } from "../config/redis.js";

const LEADERBOARD_KEY = "leaderboard:global";

export class LeaderboardService {
  async updateScore(userId: string, mmr: number) {
    await redis.zadd(LEADERBOARD_KEY, mmr, userId);
    await redis.publish(
      "arena_events",
      JSON.stringify({ type: "LEADERBOARD_UPDATE", userId, mmr })
    );
  }

  // Batch seed 100+ players in a single Redis pipeline round-trip
  async seedPlayers(count = 100) {
    const pipeline = redis.pipeline();
    for (let i = 1; i <= count; i++) {
      const mmr = Math.floor(1000 + Math.random() * 2000);
      pipeline.zadd(LEADERBOARD_KEY, mmr, `player_${i}`);
    }
    await pipeline.exec();
  }

  async getTopPlayers(limit = 20) {
    const raw = await redis.zrevrange(LEADERBOARD_KEY, 0, limit - 1, "WITHSCORES");
    const players = [];
    for (let i = 0; i < raw.length; i += 2) {
      players.push({ rank: i / 2 + 1, userId: raw[i], mmr: Number(raw[i + 1]) });
    }
    return players;
  }

  // Fetch player's exact rank + 2 players above and 2 below
  async getPlayerContext(userId: string) {
    const rank = await redis.zrevrank(LEADERBOARD_KEY, userId);
    if (rank === null) return null;

    const start = Math.max(0, rank - 2);
    const end = rank + 2;
    const raw = await redis.zrevrange(LEADERBOARD_KEY, start, end, "WITHSCORES");

    const neighbors = [];
    for (let i = 0; i < raw.length; i += 2) {
      neighbors.push({
        rank: start + i / 2 + 1,
        userId: raw[i],
        mmr: Number(raw[i + 1]),
        isSelf: raw[i] === userId,
      });
    }
    return { rank: rank + 1, neighbors };
  }
}