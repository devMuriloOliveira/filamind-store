-- Mantém os rótulos antigos sem reclassificar produtos existentes.
ALTER TABLE filamind_store.products DROP CONSTRAINT products_category_check;
ALTER TABLE filamind_store.products ADD CONSTRAINT products_category_check CHECK (category IN (
  'impressoras-3d', 'filamentos', 'pecas-reposicao', 'acessorios-ferramentas', 'resinas', 'kits-combos',
  'Filamentos', 'Impressoras 3D', 'Bicos e hotends', 'Peças de reposição', 'Ferramentas', 'Acessórios', 'Manutenção', 'Outros'
));
INSERT INTO filamind_store.schema_migrations (version) VALUES (3);
