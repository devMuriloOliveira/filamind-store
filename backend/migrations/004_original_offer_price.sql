-- Guarda o preço original sem alterar ofertas existentes.
ALTER TABLE filamind_store.offers ADD COLUMN original_price_cents integer;
ALTER TABLE filamind_store.offers ADD CONSTRAINT offers_original_price_check CHECK (
  original_price_cents IS NULL OR
  (price_cents IS NOT NULL AND original_price_cents > price_cents AND price_display_authorized)
);
INSERT INTO filamind_store.schema_migrations (version) VALUES (4);
