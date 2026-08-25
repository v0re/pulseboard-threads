ALTER TABLE threads_connections ADD COLUMN IF NOT EXISTS token_version bigint NOT NULL DEFAULT 1;

ALTER TABLE threads_connections ADD COLUMN IF NOT EXISTS session_version text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS search_rate_limits (
  connection_id text NOT NULL REFERENCES threads_connections(id) ON DELETE CASCADE,
  bucket_type text NOT NULL CHECK (bucket_type IN ('minute', 'day')),
  bucket_start timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count >= 0),
  PRIMARY KEY (connection_id, bucket_type, bucket_start)
);
