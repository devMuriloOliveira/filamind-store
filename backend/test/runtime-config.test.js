import test from 'node:test'
import assert from 'node:assert/strict'
import { loadRuntimeConfig } from '../src/runtimeConfig.js'

test('runtime configuration fails closed for missing PostgreSQL settings and unsupported production modes', () => {
  assert.equal(loadRuntimeConfig({}).storage, 'json')
  assert.throws(() => loadRuntimeConfig({ FILAMIND_STORAGE: 'postgres' }), /DATABASE_URL/)
  assert.throws(() => loadRuntimeConfig({ NODE_ENV: 'production' }), /JSON não é permitido/)
  assert.throws(() => loadRuntimeConfig({ FILAMIND_STORAGE: 'postgres', DATABASE_URL: 'postgresql://example', FILAMIND_CORS_ORIGIN: 'https://example.com' }), /CORS/)
  assert.throws(() => loadRuntimeConfig({ FILAMIND_UPLOADS_DIR: 'relative/uploads' }), /absoluto/)
  assert.equal(loadRuntimeConfig({ FILAMIND_STORAGE: 'postgres', DATABASE_URL: 'postgresql://example' }).storage, 'postgres')
})
