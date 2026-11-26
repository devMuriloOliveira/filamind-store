import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPostgresPool } from '../src/postgresRepository.js'

const migrationPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations/004_original_offer_price.sql')

export async function initializeOriginalPrice(pool) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(52901004)')
    const versions = await client.query('SELECT version FROM filamind_store.schema_migrations WHERE version IN (1, 2, 3, 4) ORDER BY version')
    if (versions.rows.map(({ version }) => version).join(',') !== '1,2,3') throw new Error('Migrations 001 a 003 são necessárias e 004 deve estar ausente.')
    const table = await client.query(`SELECT 1 FROM information_schema.tables WHERE table_schema='filamind_store' AND table_name='offers'`)
    if (table.rowCount !== 1) throw new Error('Tabela de ofertas ausente. Nada foi alterado.')
    await client.query(await readFile(migrationPath, 'utf8'))
    await client.query('COMMIT')
    return { version: 4, created: true }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally { client.release() }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== '--apply') {
    console.error('Uso: npm run db:original-price -- --apply. Confirme destino e backup antes de executar.')
    process.exitCode = 2
  } else {
    let pool
    try {
      pool = createPostgresPool(process.env.DATABASE_URL)
      await initializeOriginalPrice(pool)
      console.log('Migration 004 aplicada. Ofertas existentes preservadas.')
    } catch {
      console.error('Falha ao aplicar a migration 004. Transação revertida; nenhuma credencial foi exibida.')
      process.exitCode = 1
    } finally { await pool?.end() }
  }
}
