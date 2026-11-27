-- KEYS[1]: event:{eventId}:stock
-- KEYS[2]: seat:{eventId}:{seatId}
-- ARGV[1]: userId
-- ARGV[2]: ttlSeconds

local stock = tonumber(redis.call("GET", KEYS[1]))
if not stock or stock <= 0 then
  return {0, "SOLD_OUT"}
end

if redis.call("EXISTS", KEYS[2]) == 1 then
  return {0, "SEAT_LOCKED"}
end

redis.call("DECR", KEYS[1])
redis.call("SET", KEYS[2], ARGV[1], "EX", tonumber(ARGV[2]))

return {1, "RESERVED"}