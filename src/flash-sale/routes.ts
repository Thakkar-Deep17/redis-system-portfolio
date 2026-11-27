import { FastifyInstance } from "fastify";
import { redis } from "../config/redis.js";

export async function flashSaleRoutes(app: FastifyInstance) {
  // 1. Seed 100+ tickets and clear any old seat locks for that event
  app.post("/flash-sale/seed", async (req) => {
    const { eventId = "concert-1", totalTickets = 100 } = (req.body as any) || {};

    const oldLocks = await redis.keys(`seat:${eventId}:*`);
    if (oldLocks.length > 0) {
      await redis.del(...oldLocks);
    }

    await redis.set(`event:${eventId}:stock`, totalTickets);
    await redis.publish(
      "arena_events",
      JSON.stringify({ type: "STOCK_SEEDED", eventId, remainingStock: totalTickets })
    );

    return { ok: true, eventId, totalTickets };
  });

  // 2. Get live remaining stock & count of currently locked seats
  app.get("/flash-sale/status/:eventId", async (req) => {
    const { eventId } = req.params as { eventId: string };
    const [stock, activeLocks] = await Promise.all([
      redis.get(`event:${eventId}:stock`),
      redis.keys(`seat:${eventId}:*`),
    ]);

    return {
      eventId,
      remainingStock: Number(stock ?? 0),
      activeLockedSeats: activeLocks.length,
    };
  });

  // 3. Atomic seat reservation (handles 100s of simultaneous requests safely)
  app.post("/flash-sale/reserve", async (req, reply) => {
    const { eventId = "concert-1", seatId, userId } = req.body as any;

    if (!seatId || !userId) {
      return reply.code(400).send({ ok: false, reason: "MISSING_FIELDS" });
    }

    const [success, status] = await redis.atomicReserveTicket(
      `event:${eventId}:stock`,
      `seat:${eventId}:${seatId}`,
      userId,
      300 // 5-minute checkout TTL
    );

    if (success === 0) {
      return reply.code(409).send({ ok: false, reason: status });
    }

    return { ok: true, status, seatId, expiresInSeconds: 300 };
  });

  // 4. Confirm payment -> Push to Redis Stream for async PostgreSQL write
  app.post("/flash-sale/confirm", async (req, reply) => {
    const { eventId = "concert-1", seatId, userId } = req.body as any;
    const lockKey = `seat:${eventId}:${seatId}`;

    const lockedBy = await redis.get(lockKey);
    if (lockedBy !== userId) {
      return reply.code(400).send({ ok: false, reason: "LOCK_EXPIRED_OR_INVALID" });
    }

    await redis.del(lockKey);

    const streamId = await redis.xadd(
      "orders:stream",
      "*",
      "eventId",
      eventId,
      "seatId",
      seatId,
      "userId",
      userId
    );

    return reply.code(202).send({ ok: true, status: "QUEUED_FOR_PERSISTENCE", streamId });
  });
}