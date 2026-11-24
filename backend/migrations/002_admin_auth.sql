-- Aplicar somente pelo script init-admin-auth, após a migration 001.
CREATE TABLE filamind_store.admin_users (
  id uuid PRIMARY KEY,
  email_key text NOT NULL UNIQUE CHECK (char_length(email_key) BETWEEN 3 AND 254),
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE filamind_store.admin_sessions (
  token_hash text PRIMARY KEY CHECK (char_length(token_hash) = 64),
  admin_user_id uuid NOT NULL REFERENCES filamind_store.admin_users(id) ON DELETE RESTRICT,
  csrf_token text NOT NULL CHECK (char_length(csrf_token) = 43),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX admin_sessions_user_expiry_idx ON filamind_store.admin_sessions (admin_user_id, expires_at DESC);
CREATE INDEX admin_sessions_expiry_idx ON filamind_store.admin_sessions (expires_at) WHERE revoked_at IS NULL;

CREATE TABLE filamind_store.admin_login_attempts (
  key_hash text PRIMARY KEY CHECK (char_length(key_hash) = 64),
  failures integer NOT NULL CHECK (failures > 0),
  window_started_at timestamptz NOT NULL,
  locked_until timestamptz
);
CREATE INDEX admin_login_attempts_lock_idx ON filamind_store.admin_login_attempts (locked_until) WHERE locked_until IS NOT NULL;

INSERT INTO filamind_store.schema_migrations (version) VALUES (2);
