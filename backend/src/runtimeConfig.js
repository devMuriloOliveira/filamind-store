import path from 'node:path'

export function loadRuntimeConfig(env = process.env) {
  const storage = env.FILAMIND_STORAGE || 'json'
  if (!['json', 'postgres'].includes(storage)) throw new Error('FILAMIND_STORAGE deve ser json ou postgres.')
  if (env.NODE_ENV === 'production' && storage !== 'postgres') throw new Error('JSON não é permitido como persistência de produção.')
  if (storage === 'postgres' && !env.DATABASE_URL) throw new Error('DATABASE_URL é obrigatória no modo PostgreSQL.')
  const host = env.HOST || '127.0.0.1'
  const port = Number(env.PORT || 4180)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválida.')
  if (env.FILAMIND_CORS_ORIGIN) throw new Error('CORS entre origens ainda não está habilitado; sirva frontend e API na mesma origem.')
  const uploadsPath = env.FILAMIND_UPLOADS_DIR || ''
  if (uploadsPath && !path.isAbsolute(uploadsPath)) throw new Error('FILAMIND_UPLOADS_DIR deve ser absoluto.')
  return { storage, host, port, uploadsPath, databaseUrl: env.DATABASE_URL || '' }
}
