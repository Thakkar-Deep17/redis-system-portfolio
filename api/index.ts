import Fastify from "fastify";
import cors from "@fastify/cors";
import { flashSaleRoutes } from "../src/flash-sale/routes.js";
import { gameArenaRoutes } from "../src/game-arena/routes.js";

const app = Fastify({ logger: true });

app.register(cors, { origin: "*" });
app.register(flashSaleRoutes, { prefix: "/api" });
app.register(gameArenaRoutes, { prefix: "/api" });

export default async function handler(req: any, res: any) {
  await app.ready();
  app.server.emit("request", req, res);
}