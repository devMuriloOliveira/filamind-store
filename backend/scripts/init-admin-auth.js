import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPostgresPool } from '../src/postgresRepository.js'

const migrationPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations/002_admin_auth.sql')

export async function initializeAdminAuthSchema(pool) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(52901002)')
    const initial = await client.query('SELECT version FROM filamind_store.schema_migrations WHERE version = 1')
    if (initial.rowCount !== 1) throw new Error('Migration 001 ausente. Nada foi alterado.')
    const existing = await client.query(`SELECT
      to_regclass('filamind_store.admin_users') IS NOT NULL AS users,
      to_regclass('filamind_store.admin_sessions') IS NOT NULL AS sessions,
      to_regclass('filamind_store.admin_login_attempts') IS NOT NULL AS attempts,
      EXISTS (SELECT 1 FROM filamind_store.schema_migrations WHERE version = 2) AS applied`)
    if (Object.values(existing.rows[0]).some(Boolean)) throw new Error('A estrutura de autenticação já existe. Nada foi alterado.')
    await client.query(await readFile(migrationPath, 'utf8'))
    await client.query('COMMIT')
    return { version: 2, created: true }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally { client.release() }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== '--apply') {
    console.error('Uso: npm run db:admin-auth -- --apply. A operação exige autorização e backup prévios.')
    process.exitCode = 2
  } else {
    let pool
    try {
      pool = createPostgresPool(process.env.DATABASE_URL)
      await initializeAdminAuthSchema(pool)
      console.log('Migration 002 aplicada. Nenhuma conta administrativa foi criada.')
    } catch {
      console.error('Falha ao aplicar a migration 002. Transação revertida; nenhuma credencial foi exibida.')
      process.exitCode = 1
    } finally { await pool?.end() }
  }
}
