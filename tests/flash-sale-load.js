import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: 500,        // 500 concurrent virtual users
  iterations: 500, // 500 simultaneous reservation requests
};

// Seed 100 tickets automatically before the 500 bots attack
export function setup() {
  http.post(
    "http://localhost:3000/api/flash-sale/seed",
    JSON.stringify({ eventId: "concert-1", totalTickets: 100 }),
    { headers: { "Content-Type": "application/json" } }
  );
}

export default function () {
  // 500 users compete across 100 distinct seats (5 users fighting per seat)
  const seatNum = (__VU % 100) + 1;
  const payload = JSON.stringify({
    eventId: "concert-1",
    seatId: `VIP-${seatNum}`,
    userId: `user-${__VU}`,
  });

  const res = http.post("http://localhost:3000/api/flash-sale/reserve", payload, {
    headers: { "Content-Type": "application/json" },
  });

  check(res, {
    "valid response (200 reserved or 409 conflict)": (r) =>
      r.status === 200 || r.status === 409,
    "no 500 server errors": (r) => r.status !== 500,
  });
}