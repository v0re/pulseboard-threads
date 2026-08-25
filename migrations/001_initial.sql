CREATE TABLE IF NOT EXISTS threads_connections (
  id text PRIMARY KEY,
  threads_user_id text NOT NULL UNIQUE,
  username text NOT NULL,
  display_name text,
  profile_picture_url text,
  biography text,
  access_token_encrypted text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  token_refreshed_at timestamptz NOT NULL DEFAULT now(),
  token_version bigint NOT NULL DEFAULT 1,
  session_version text NOT NULL DEFAULT '',
  granted_scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  last_sync_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE threads_connections ADD COLUMN IF NOT EXISTS token_version bigint NOT NULL DEFAULT 1;
ALTER TABLE threads_connections ADD COLUMN IF NOT EXISTS session_version text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS threads_posts (
  id text PRIMARY KEY,
  connection_id text NOT NULL REFERENCES threads_connections(id) ON DELETE CASCADE,
  media_product_type text,
  media_type text,
  permalink text,
  username text,
  body_text text,
  published_at timestamptz,
  shortcode text,
  is_quote_post boolean NOT NULL DEFAULT false,
  has_replies boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  unavailable_at timestamptz
);

CREATE INDEX IF NOT EXISTS threads_posts_connection_published_idx
  ON threads_posts(connection_id, published_at DESC);

CREATE TABLE IF NOT EXISTS post_metric_snapshots (
  post_id text NOT NULL REFERENCES threads_posts(id) ON DELETE CASCADE,
  captured_on date NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  views bigint,
  likes bigint,
  replies bigint,
  reposts bigint,
  quotes bigint,
  shares bigint,
  PRIMARY KEY (post_id, captured_on)
);

CREATE INDEX IF NOT EXISTS post_metric_snapshots_date_idx
  ON post_metric_snapshots(captured_on DESC);

CREATE TABLE IF NOT EXISTS account_metric_snapshots (
  connection_id text NOT NULL REFERENCES threads_connections(id) ON DELETE CASCADE,
  captured_on date NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  views bigint,
  likes bigint,
  replies bigint,
  reposts bigint,
  quotes bigint,
  clicks bigint,
  followers_count bigint,
  PRIMARY KEY (connection_id, captured_on)
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id text PRIMARY KEY,
  connection_id text NOT NULL REFERENCES threads_connections(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('oauth', 'manual', 'cron')),
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
  posts_seen integer NOT NULL DEFAULT 0,
  api_calls integer NOT NULL DEFAULT 0,
  error_code text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS sync_runs_connection_started_idx
  ON sync_runs(connection_id, started_at DESC);

CREATE TABLE IF NOT EXISTS sync_locks (
  connection_id text PRIMARY KEY REFERENCES threads_connections(id) ON DELETE CASCADE,
  owner_id text NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id text PRIMARY KEY,
  connection_id text REFERENCES threads_connections(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_connection_created_idx
  ON audit_events(connection_id, created_at DESC);

CREATE TABLE IF NOT EXISTS search_rate_limits (
  connection_id text NOT NULL REFERENCES threads_connections(id) ON DELETE CASCADE,
  bucket_type text NOT NULL CHECK (bucket_type IN ('minute', 'day')),
  bucket_start timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count >= 0),
  PRIMARY KEY (connection_id, bucket_type, bucket_start)
);
