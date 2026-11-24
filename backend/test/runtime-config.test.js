import test from 'node:test'
import assert from 'node:assert/strict'
import { loadRuntimeConfig } from '../src/runtimeConfig.js'
import { createPostgresPool } from '../src/postgresRepository.js'

test('runtime configuration fails closed for missing PostgreSQL settings and unsupported production modes', async () => {
  assert.equal(loadRuntimeConfig({}).storage, 'json')
  assert.throws(() => loadRuntimeConfig({ FILAMIND_STORAGE: 'postgres' }), /DATABASE_URL/)
  assert.throws(() => loadRuntimeConfig({ NODE_ENV: 'production' }), /JSON não é permitido/)
  assert.throws(() => loadRuntimeConfig({ NODE_ENV: 'production', FILAMIND_STORAGE: 'postgres', DATABASE_URL: 'postgresql://example/db?sslmode=require' }), /sslmode=verify-full/)
  assert.throws(() => loadRuntimeConfig({ NODE_ENV: 'production', FILAMIND_STORAGE: 'postgres', DATABASE_URL: 'postgresql://example/db?sslmode=no-verify' }), /sslmode=verify-full/)
  assert.equal(loadRuntimeConfig({ NODE_ENV: 'production', FILAMIND_STORAGE: 'postgres', DATABASE_URL: 'postgresql://example/db?sslmode=verify-full' }).storage, 'postgres')
  const pool = createPostgresPool('postgresql://example/db?sslmode=verify-full')
  assert.notEqual(pool.options.ssl, false)
  assert.notEqual(pool.options.ssl?.rejectUnauthorized, false)
  assert.equal(pool.options.ssl?.checkServerIdentity, undefined)
  await pool.end()
  assert.throws(() => loadRuntimeConfig({ NODE_ENV: 'production', FILAMIND_STORAGE: 'postgres', DATABASE_URL: 'postgresql://example/db?sslmode=verify-full', FILAMIND_LOCAL_ADMIN: '1' }), /local não é permitido/)
  assert.throws(() => loadRuntimeConfig({ FILAMIND_STORAGE: 'postgres', DATABASE_URL: 'postgresql://example', FILAMIND_CORS_ORIGIN: 'https://example.com' }), /CORS/)
  assert.throws(() => loadRuntimeConfig({ FILAMIND_UPLOADS_DIR: 'relative/uploads' }), /absoluto/)
  assert.equal(loadRuntimeConfig({ FILAMIND_STORAGE: 'postgres', DATABASE_URL: 'postgresql://example' }).storage, 'postgres')
  assert.equal(loadRuntimeConfig({}).imageStorage, 'local')
  assert.throws(() => loadRuntimeConfig({ FILAMIND_IMAGE_STORAGE: 'other' }), /FILAMIND_IMAGE_STORAGE/)
  assert.throws(() => loadRuntimeConfig({ FILAMIND_IMAGE_STORAGE: 'supabase' }), /SUPABASE_URL/)
  assert.equal(loadRuntimeConfig({ FILAMIND_IMAGE_STORAGE: 'supabase', SUPABASE_URL: 'https://demo.supabase.co', SUPABASE_STORAGE_BUCKET: 'offers', SUPABASE_SECRET_KEY: 'sb_secret_test' }).imageStorage, 'supabase')
  assert.equal(loadRuntimeConfig({}).adminAuth, 'off')
  assert.throws(() => loadRuntimeConfig({ FILAMIND_ADMIN_AUTH: 'postgres' }), /PostgreSQL/)
  const auth = { FILAMIND_STORAGE: 'postgres', DATABASE_URL: 'postgresql://example/db?sslmode=verify-full', FILAMIND_ADMIN_AUTH: 'postgres' }
  assert.throws(() => loadRuntimeConfig(auth), /FILAMIND_ADMIN_ORIGIN/)
  assert.throws(() => loadRuntimeConfig({ ...auth, FILAMIND_ADMIN_ORIGIN: 'http://example.com' }), /HTTPS/)
  assert.throws(() => loadRuntimeConfig({ ...auth, NODE_ENV: 'production', FILAMIND_ADMIN_ORIGIN: 'http://127.0.0.1:4180' }), /HTTPS/)
  assert.throws(() => loadRuntimeConfig({ ...auth, HOST: '0.0.0.0', FILAMIND_ADMIN_ORIGIN: 'http://127.0.0.1:4180' }), /HTTPS/)
  assert.throws(() => loadRuntimeConfig({ ...auth, FILAMIND_LOCAL_ADMIN: '1', FILAMIND_ADMIN_ORIGIN: 'https://store.example.com' }), /acesso local/)
  assert.equal(loadRuntimeConfig({ ...auth, FILAMIND_ADMIN_ORIGIN: 'http://127.0.0.1:4180' }).adminAuth, 'postgres')
  assert.equal(loadRuntimeConfig({ ...auth, FILAMIND_ADMIN_ORIGIN: 'https://127.0.0.1:8443' }).adminOrigin, 'https://127.0.0.1:8443')
  assert.equal(loadRuntimeConfig({ ...auth, NODE_ENV: 'production', FILAMIND_ADMIN_ORIGIN: 'https://store.example.com' }).adminOrigin, 'https://store.example.com')
})
