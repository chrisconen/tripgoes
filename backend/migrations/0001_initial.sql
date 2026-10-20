PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS offers (
 id TEXT PRIMARY KEY CHECK(length(id)=64),
 source_id TEXT NOT NULL,
 external_id TEXT NOT NULL,
 origin_key TEXT NOT NULL,
 destination_key TEXT NOT NULL,
 currency TEXT NOT NULL,
 departure_date TEXT NOT NULL,
 observed_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','withdrawn')),
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS offers_fresh ON offers(source_id,status,expires_at,departure_date);
CREATE INDEX IF NOT EXISTS offers_route ON offers(origin_key,destination_key,currency);
CREATE TABLE IF NOT EXISTS observations (
 offer_id TEXT NOT NULL REFERENCES offers(id),
 observed_at TEXT NOT NULL,
 total_price_minor INTEGER NOT NULL CHECK(total_price_minor>=0 AND total_price_minor<=100000000000),
 expires_at TEXT NOT NULL,
 booking_url TEXT NOT NULL,
 received_at TEXT NOT NULL,
 PRIMARY KEY(offer_id,observed_at)
);
CREATE TRIGGER IF NOT EXISTS reject_observation_conflict BEFORE INSERT ON observations
WHEN EXISTS(SELECT 1 FROM observations WHERE offer_id=NEW.offer_id AND observed_at=NEW.observed_at
 AND (total_price_minor!=NEW.total_price_minor OR expires_at!=NEW.expires_at OR booking_url!=NEW.booking_url))
BEGIN SELECT RAISE(ABORT,'observation_conflict'); END;
CREATE TABLE IF NOT EXISTS import_batches (
 source_id TEXT NOT NULL,
 batch_id TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 offer_count INTEGER NOT NULL,
 received_at TEXT NOT NULL,
 PRIMARY KEY(source_id,batch_id)
);
CREATE TABLE IF NOT EXISTS maintenance (
 name TEXT PRIMARY KEY,
 completed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS withdrawals (
 source_id TEXT NOT NULL,
 external_id TEXT NOT NULL,
 withdrawn_at TEXT NOT NULL,
 PRIMARY KEY(source_id,external_id)
);
