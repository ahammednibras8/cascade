local delayedQueueKey = KEYS[1]
local queueKey = KEYS[2]

local now = ARGV[1]
local limit = tonumber(ARGV[2])

local messages = redis.call(
    "ZRANGEBYSCORE",
    delayedQueueKey,
    "-inf",
    now,
    "LIMIT",
    0,
    limit
)

for _, message in ipairs(messages) do
    redis.call("ZREM", delayedQueueKey, message)
    redis.call("RPUSH", queueKey, message)
end

return #messages