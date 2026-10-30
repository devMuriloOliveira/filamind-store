-- Aplicar apenas pelo comando init-schema, em transação e em schema ainda inexistente.
CREATE SCHEMA filamind_store;

CREATE TABLE filamind_store.schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE filamind_store.products (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 140),
  name_key text NOT NULL,
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  category text NOT NULL CHECK (category IN ('Filamentos', 'Impressoras 3D', 'Bicos e hotends', 'Peças de reposição', 'Ferramentas', 'Acessórios', 'Manutenção', 'Outros')),
  keywords text[] NOT NULL DEFAULT '{}',
  image_url text NOT NULL DEFAULT '',
  image_rights_source text NOT NULL DEFAULT '',
  featured boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz
);
CREATE UNIQUE INDEX products_name_key_live_uq ON filamind_store.products (name_key) WHERE deleted_at IS NULL;
CREATE INDEX products_category_status_idx ON filamind_store.products (category, active, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX products_created_idx ON filamind_store.products (created_at DESC, id) WHERE deleted_at IS NULL;

CREATE TABLE filamind_store.offers (
  id uuid PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES filamind_store.products(id) ON DELETE RESTRICT,
  marketplace text NOT NULL CHECK (marketplace IN ('shopee', 'mercado_livre', 'amazon')),
  affiliate_url text NOT NULL CHECK (char_length(affiliate_url) <= 2048 AND affiliate_url LIKE 'https://%'),
  affiliate_confirmed boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT false,
  price_cents integer CHECK (price_cents > 0),
  price_display_authorized boolean NOT NULL DEFAULT false,
  price_source text NOT NULL DEFAULT '',
  price_updated_at timestamptz,
  availability text NOT NULL DEFAULT 'unknown' CHECK (availability IN ('unknown', 'available', 'unavailable')),
  availability_confirmed_at timestamptz,
  last_synced_at timestamptz,
  sync_error_at timestamptz,
  external_state text CHECK (external_state IN ('available', 'unavailable', 'temporarily_unavailable', 'removed', 'ended')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  CHECK (NOT active OR affiliate_confirmed),
  CHECK (price_cents IS NULL OR (price_display_authorized AND price_source <> '' AND price_updated_at IS NOT NULL)),
  CHECK (marketplace <> 'amazon' OR (price_cents IS NULL AND availability = 'unknown')),
  CHECK (availability = 'unknown' OR availability_confirmed_at IS NOT NULL)
);
CREATE UNIQUE INDEX offers_affiliate_url_live_uq ON filamind_store.offers (affiliate_url) WHERE deleted_at IS NULL;
CREATE INDEX offers_product_idx ON filamind_store.offers (product_id) WHERE deleted_at IS NULL;
CREATE INDEX offers_marketplace_status_idx ON filamind_store.offers (marketplace, active, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX offers_created_idx ON filamind_store.offers (created_at DESC, id) WHERE deleted_at IS NULL;
CREATE INDEX offers_price_idx ON filamind_store.offers (price_cents) WHERE active AND price_display_authorized AND deleted_at IS NULL;

-- Reservada para a futura integração administrativa. Nenhum evento é gerado sem identidade real.
CREATE TABLE filamind_store.admin_audit (
  id uuid PRIMARY KEY,
  actor_id text NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX admin_audit_occurred_idx ON filamind_store.admin_audit (occurred_at DESC);

CREATE TABLE filamind_store.catalog_imports (
  catalog_sha256 text PRIMARY KEY,
  products_count integer NOT NULL,
  offers_count integer NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO filamind_store.schema_migrations (version) VALUES (1);
