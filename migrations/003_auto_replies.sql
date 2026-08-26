CREATE TABLE IF NOT EXISTS auto_reply_settings (
  connection_id text PRIMARY KEY REFERENCES threads_connections(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  enabled_at timestamptz,
  daily_limit smallint NOT NULL DEFAULT 5 CHECK (daily_limit BETWEEN 1 AND 50),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auto_reply_receipts (
  connection_id text NOT NULL REFERENCES threads_connections(id) ON DELETE CASCADE,
  source_reply_id text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, source_reply_id)
);

CREATE TABLE IF NOT EXISTS auto_reply_jobs (
  id text PRIMARY KEY,
  connection_id text NOT NULL REFERENCES threads_connections(id) ON DELETE CASCADE,
  root_post_id text NOT NULL REFERENCES threads_posts(id) ON DELETE CASCADE,
  source_reply_id text NOT NULL,
  source_username text,
  source_created_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN (
    'discovered', 'generating', 'ready', 'publishing',
    'published', 'skipped', 'failed', 'uncertain'
  )),
  category text,
  skip_reason text,
  generated_reply text CHECK (generated_reply IS NULL OR char_length(generated_reply) BETWEEN 1 AND 1000),
  container_id text,
  threads_response_id text,
  openai_response_id text,
  model text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  error_code text,
  quota_local_date date,
  publish_attempted_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, source_reply_id),
  FOREIGN KEY (connection_id, source_reply_id)
    REFERENCES auto_reply_receipts(connection_id, source_reply_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS auto_reply_jobs_connection_created_idx
  ON auto_reply_jobs(connection_id, created_at DESC);

CREATE INDEX IF NOT EXISTS auto_reply_jobs_root_post_idx
  ON auto_reply_jobs(root_post_id);

CREATE INDEX IF NOT EXISTS auto_reply_jobs_daily_usage_idx
  ON auto_reply_jobs(connection_id, publish_attempted_at)
  WHERE publish_attempted_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS auto_reply_daily_usage (
  connection_id text NOT NULL REFERENCES threads_connections(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  reserved_count smallint NOT NULL CHECK (reserved_count BETWEEN 0 AND 50),
  PRIMARY KEY (connection_id, local_date)
);

ALTER TABLE threads_posts
  ADD COLUMN IF NOT EXISTS replies_scanned_at timestamptz;
