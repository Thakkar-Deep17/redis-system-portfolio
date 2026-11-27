import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "path";
import { Server } from "socket.io";
import { flashSaleRoutes } from "./flash-sale/routes.js";
import { gameArenaRoutes } from "./game-arena/routes.js";
import { startMatchmakingLoop } from "./game-arena/matchmaking.worker.js";
import { redisSub } from "./config/redis.js";

const app = Fastify({ logger: true });

async function start() {
  try {
    await app.register(cors, { origin: "*" });

    // Serve both UIs from /public (/index.html and /arena.html)
    await app.register(fastifyStatic, {
      root: path.join(__dirname, "../public"),
      prefix: "/",
    });

    // Mount both projects under /api
    await app.register(flashSaleRoutes, { prefix: "/api" });
    await app.register(gameArenaRoutes, { prefix: "/api" });

    const port = Number(process.env.PORT) || 3000;
    await app.listen({ port, host: "0.0.0.0" });

    const io = new Server(app.server, { cors: { origin: "*" } });

    await redisSub.subscribe("arena_events");
    redisSub.on("message", (_channel, message) => {
      io.emit("arena_event", JSON.parse(message));
    });

    // Match 10 players per lobby within ±250 MMR and 2,000 km radius
    startMatchmakingLoop(10, 250, 2000);

    console.log(`⚡ Portfolio Server running at http://localhost:${port}`);
    console.log(`🎟️  Flash-Sale UI: http://localhost:${port}/index.html`);
    console.log(`🎮 Game Arena UI: http://localhost:${port}/arena.html`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();