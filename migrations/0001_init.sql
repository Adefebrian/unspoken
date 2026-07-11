CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS unspoken (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body text NOT NULL,
  relate_count integer NOT NULL DEFAULT 0,
  hug_count integer NOT NULL DEFAULT 0,
  report_count integer NOT NULL DEFAULT 0,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS unspoken_created_idx ON unspoken (created_at DESC) WHERE is_hidden = false;

CREATE INDEX IF NOT EXISTS unspoken_created_at_idx ON unspoken (created_at);

CREATE TABLE IF NOT EXISTS reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unspoken_id uuid NOT NULL REFERENCES unspoken(id) ON DELETE CASCADE,
  ip_hash text NOT NULL,
  type text NOT NULL CHECK (type IN ('relate','hug')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unspoken_id, ip_hash, type)
);

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unspoken_id uuid NOT NULL REFERENCES unspoken(id) ON DELETE CASCADE,
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unspoken_id, ip_hash)
);
