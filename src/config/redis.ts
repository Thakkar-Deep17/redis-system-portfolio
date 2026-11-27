import Redis from "ioredis";
import fs from "node:fs";
import path from "node:path";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
});

// Separate connection required because Redis clients in SUBSCRIBE mode cannot run normal commands
export const redisSub = new Redis(REDIS_URL);

const reserveLua = fs.readFileSync(
  path.join(__dirname, "../flash-sale/reserve.lua"),
  "utf8"
);

redis.defineCommand("atomicReserveTicket", {
  numberOfKeys: 2,
  lua: reserveLua,
});

declare module "ioredis" {
  interface RedisCommander<Context> {
    atomicReserveTicket(
      stockKey: string,
      seatLockKey: string,
      userId: string,
      ttlSeconds: number
    ): Promise<[number, string]>;
  }
}