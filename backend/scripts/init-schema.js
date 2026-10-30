import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPostgresPool } from '../src/postgresRepository.js'

const migrationPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations/001_initial.sql')

export async function initializeSchema(pool) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(52901001)')
    const existing = await client.query("SELECT to_regnamespace('filamind_store') AS schema")
    if (existing.rows[0].schema !== null) throw new Error('O schema filamind_store já existe. Nada foi alterado.')
    await client.query(await readFile(migrationPath, 'utf8'))
    await client.query('COMMIT')
    return { version: 1, created: true }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally { client.release() }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== '--apply') {
    console.error('Uso: npm run db:init -- --apply. O comando recusa um schema filamind_store existente.')
    process.exitCode = 2
  } else {
    let pool
    try {
      pool = createPostgresPool(process.env.DATABASE_URL)
      await initializeSchema(pool)
      console.log('Schema filamind_store v1 criado em transação. Nenhum catálogo foi importado.')
    } catch (error) {
      console.error(error.message === 'O schema filamind_store já existe. Nada foi alterado.' ? error.message : 'Falha ao criar schema. Nenhuma credencial foi exibida.')
      process.exitCode = 1
    } finally { await pool?.end() }
  }
}
