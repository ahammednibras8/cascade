-- +goose Up
CREATE TABLE IF NOT EXISTS events
(
    id UUID DEFAULT generateUUIDv4(),
    name String,
    user_id Nullable(String),
    properties String,
    created_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
ORDER BY (created_at, name);

-- +goose Down
DROP TABLE IF EXISTS events;