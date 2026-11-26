import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPostgresPool } from '../src/postgresRepository.js'

const migrationPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations/003_product_categories.sql')

export async function initializeCategories(pool) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(52901003)')
    const versions = await client.query('SELECT version FROM filamind_store.schema_migrations WHERE version IN (1, 2, 3) ORDER BY version')
    if (versions.rows.map(({ version }) => version).join(',') !== '1,2') throw new Error('Migrations 001 e 002 são necessárias e 003 deve estar ausente.')
    const constraint = await client.query(`SELECT 1 FROM pg_constraint
      WHERE conrelid = 'filamind_store.products'::regclass AND conname = 'products_category_check' AND contype = 'c'`)
    if (constraint.rowCount !== 1) throw new Error('Constraint de categorias original ausente. Nada foi alterado.')
    await client.query(await readFile(migrationPath, 'utf8'))
    await client.query('COMMIT')
    return { version: 3, created: true }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally { client.release() }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== '--apply') {
    console.error('Uso: npm run db:categories -- --apply. Confirme destino e backup antes de executar.')
    process.exitCode = 2
  } else {
    let pool
    try {
      pool = createPostgresPool(process.env.DATABASE_URL)
      await initializeCategories(pool)
      console.log('Migration 003 aplicada. Produtos existentes preservados.')
    } catch {
      console.error('Falha ao aplicar a migration 003. Transação revertida; nenhuma credencial foi exibida.')
      process.exitCode = 1
    } finally { await pool?.end() }
  }
}
