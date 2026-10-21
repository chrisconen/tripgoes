-- Independent cache, not verified offer history. No user identifier or IP.
CREATE TABLE IF NOT EXISTS flight_cache (
 query_key TEXT PRIMARY KEY CHECK(length(query_key)=64),
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 fetched_at INTEGER NOT NULL,
 cache_until INTEGER NOT NULL CHECK(cache_until>fetched_at)
);
CREATE INDEX IF NOT EXISTS flight_cache_expiry ON flight_cache(cache_until);
CREATE TABLE IF NOT EXISTS flight_provider_budget (
 provider TEXT PRIMARY KEY,
 day_key TEXT NOT NULL,
 day_used INTEGER NOT NULL CHECK(day_used>=0),
 minute_key INTEGER NOT NULL,
 minute_used INTEGER NOT NULL CHECK(minute_used>=0)
);
