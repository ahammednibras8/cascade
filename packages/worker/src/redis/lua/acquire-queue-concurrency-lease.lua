redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[1])

local count = redis.call("ZCARD", KEYS[1])
if count >= tonumber(ARGV[2]) then
	return 0
end

redis.call("ZADD", KEYS[1], ARGV[3], ARGV[4])
redis.call("PEXPIRE", KEYS[1], ARGV[5])

return 1
