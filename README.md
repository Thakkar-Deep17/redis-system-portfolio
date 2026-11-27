# ⚡ High-Concurrency Distributed Systems Portfolio (Redis + Fastify + PostgreSQL)

A production-grade distributed systems engineering portfolio featuring two high-throughput backend architectures built with **Node.js (Fastify)**, **Redis (`ioredis`)**, **Prisma ORM (PostgreSQL)**, and **Socket.IO**:

1. **World Tour Finals — VIP Seat Drop (Flash-Sale Ticketing Engine):** Zero-oversell atomic seat reservation powered by server-side **Redis Lua scripting** and asynchronous write-behind persistence via **Redis Streams** consumer groups.
2. **FlashArena — Geospatial Matchmaking & Live Leaderboard:** Sub-millisecond global skill rankings via **Redis Sorted Sets (`ZSET`)**, proximity-aware lobby formation via **Redis Geospatial Indexing (`GEO`)**, and real-time event streaming via **Redis Pub/Sub + Socket.IO**.

---

## 🏗️ System Architecture

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER (Tailwind + Socket.IO)                 │
│   /index.html (VIP Seat Drop UI)        /arena.html (FlashArena UI)        │
└───────────────┬─────────────────────────────────────────┬──────────────────┘
                │ HTTP REST (/api/...)                    │ WebSockets
                ▼                                         ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                   FASTIFY API & REAL-TIME GATEWAY (Node.js)                 │
│  • /api/flash-sale/*  ──► Atomic Lua Script (EVALSHA) + XADD Stream        │
│  • /api/arena/*       ──► ZSET Leaderboard + GEOADD + Matchmaking Loop     │
└───────────────┬─────────────────────────────────────────┬──────────────────┘
                │                                         │
                ▼                                         ▼
┌───────────────────────────────┐         ┌──────────────────────────────────┐
│      REDIS (In-Memory Core)   │         │   POSTGRESQL (Durable Storage)   │
│  • Lua: reserve.lua (Atomic)  │         │  • TicketOrder (Write-Behind)    │
│  • Stream: orders:stream      │────────►│  • MatchHistory (Lobby Audits)   │
│  • ZSET: leaderboard:global   │ Worker  │  • Managed via Prisma ORM        │
│  • GEO: players:geo           │         └──────────────────────────────────┘
│  • Pub/Sub: arena_events      │
└───────────────────────────────┘
