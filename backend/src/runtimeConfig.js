import path from 'node:path'

export function loadRuntimeConfig(env = process.env) {
  const storage = env.FILAMIND_STORAGE || 'json'
  if (!['json', 'postgres'].includes(storage)) throw new Error('FILAMIND_STORAGE deve ser json ou postgres.')
  if (env.NODE_ENV === 'production' && storage !== 'postgres') throw new Error('JSON não é permitido como persistência de produção.')
  if (storage === 'postgres' && !env.DATABASE_URL) throw new Error('DATABASE_URL é obrigatória no modo PostgreSQL.')
  if (env.NODE_ENV === 'production') {
    let databaseUrl
    try { databaseUrl = new URL(env.DATABASE_URL) } catch { throw new Error('DATABASE_URL de produção inválida.') }
    if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol) || databaseUrl.searchParams.get('sslmode') !== 'verify-full') {
      throw new Error('DATABASE_URL de produção exige PostgreSQL com sslmode=verify-full.')
    }
    if (env.FILAMIND_LOCAL_ADMIN === '1') throw new Error('Acesso administrativo local não é permitido em produção.')
  }
  const host = env.HOST || '127.0.0.1'
  const port = Number(env.PORT || 4180)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválida.')
  if (env.FILAMIND_CORS_ORIGIN) throw new Error('CORS entre origens ainda não está habilitado; sirva frontend e API na mesma origem.')
  const uploadsPath = env.FILAMIND_UPLOADS_DIR || ''
  if (uploadsPath && !path.isAbsolute(uploadsPath)) throw new Error('FILAMIND_UPLOADS_DIR deve ser absoluto.')
  const imageStorage = env.FILAMIND_IMAGE_STORAGE || 'local'
  if (!['local', 'supabase'].includes(imageStorage)) throw new Error('FILAMIND_IMAGE_STORAGE deve ser local ou supabase.')
  if (imageStorage === 'supabase' && (!env.SUPABASE_URL || !env.SUPABASE_STORAGE_BUCKET || !env.SUPABASE_SECRET_KEY)) {
    throw new Error('SUPABASE_URL, SUPABASE_STORAGE_BUCKET e SUPABASE_SECRET_KEY são obrigatórias no modo Supabase Storage.')
  }
  const adminAuth = env.FILAMIND_ADMIN_AUTH || 'off'
  if (!['off', 'postgres'].includes(adminAuth)) throw new Error('FILAMIND_ADMIN_AUTH deve ser off ou postgres.')
  if (adminAuth === 'postgres') {
    if (storage !== 'postgres' || env.FILAMIND_LOCAL_ADMIN === '1') throw new Error('Autenticação PostgreSQL exige catálogo PostgreSQL e acesso local por código desligado.')
    let origin
    try { origin = new URL(env.FILAMIND_ADMIN_ORIGIN) } catch { throw new Error('FILAMIND_ADMIN_ORIGIN inválida.') }
    if (origin.origin !== env.FILAMIND_ADMIN_ORIGIN || origin.username || origin.password || origin.hash || origin.search ||
        (origin.protocol !== 'https:' && (env.NODE_ENV === 'production' || origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || host !== '127.0.0.1'))) {
      throw new Error('FILAMIND_ADMIN_ORIGIN exige HTTPS ou HTTP em 127.0.0.1 apenas no desenvolvimento.')
    }
  }
  return { storage, imageStorage, host, port, uploadsPath, databaseUrl: env.DATABASE_URL || '',
    supabaseUrl: env.SUPABASE_URL || '', supabaseBucket: env.SUPABASE_STORAGE_BUCKET || '', supabaseSecretKey: env.SUPABASE_SECRET_KEY || '',
    adminAuth, adminOrigin: env.FILAMIND_ADMIN_ORIGIN || '' }
}
