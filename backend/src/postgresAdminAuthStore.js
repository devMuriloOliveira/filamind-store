import { randomUUID } from 'node:crypto'

async function audit(client, actorId, action, targetType, targetId = null, details = {}) {
  await client.query(`INSERT INTO filamind_store.admin_audit
    (id, actor_id, action, target_type, target_id, details)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
  [randomUUID(), actorId, action, targetType, targetId, JSON.stringify(details)])
}

export function createPostgresAdminAuthStore(pool) {
  return {
    async assertReady() {
      const result = await pool.query('SELECT version FROM filamind_store.schema_migrations WHERE version = 2')
      if (result.rowCount !== 1) throw new Error('Migration 002 de autenticação não aplicada.')
    },
    async findUser(emailKey) {
      return (await pool.query(`SELECT id, password_hash AS "passwordHash", active
        FROM filamind_store.admin_users WHERE email_key = $1`, [emailKey])).rows[0] || null
    },
    async reserveAttempt(keyHash, limit, now) {
      const result = await pool.query(`INSERT INTO filamind_store.admin_login_attempts AS attempts
        (key_hash, failures, window_started_at, locked_until) VALUES ($1, 1, $2, NULL)
        ON CONFLICT (key_hash) DO UPDATE SET
          failures = CASE WHEN attempts.window_started_at <= $2::timestamptz - interval '15 minutes'
            THEN 1 ELSE attempts.failures + 1 END,
          window_started_at = CASE WHEN attempts.window_started_at <= $2::timestamptz - interval '15 minutes'
            THEN $2 ELSE attempts.window_started_at END,
          locked_until = CASE WHEN attempts.window_started_at <= $2::timestamptz - interval '15 minutes'
            THEN NULL WHEN attempts.failures + 1 >= $3 THEN $2::timestamptz + interval '15 minutes'
            ELSE NULL END
        WHERE attempts.locked_until IS NULL OR attempts.locked_until <= $2
        RETURNING locked_until`, [keyHash, now, limit])
      return result.rowCount === 1 && result.rows[0].locked_until === null
    },
    async createSession({ userId, tokenHash, csrfToken, now, expiresAt, attemptKeys }) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(`INSERT INTO filamind_store.admin_sessions
          (token_hash, admin_user_id, csrf_token, created_at, expires_at) VALUES ($1, $2, $3, $4, $5)`,
        [tokenHash, userId, csrfToken, now, expiresAt])
        for (const keyHash of attemptKeys) {
          await client.query('DELETE FROM filamind_store.admin_login_attempts WHERE key_hash = $1', [keyHash])
        }
        await audit(client, userId, 'login_success', 'admin_user', userId)
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally { client.release() }
    },
    async findSession(tokenHash, now) {
      return (await pool.query(`SELECT sessions.admin_user_id AS "userId", sessions.csrf_token AS "csrfToken"
        FROM filamind_store.admin_sessions AS sessions
        JOIN filamind_store.admin_users AS users ON users.id = sessions.admin_user_id
        WHERE sessions.token_hash = $1 AND sessions.revoked_at IS NULL
          AND sessions.expires_at > $2 AND users.active`, [tokenHash, now])).rows[0] || null
    },
    async revokeSession(tokenHash, now) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await client.query(`UPDATE filamind_store.admin_sessions SET revoked_at = $2
          WHERE token_hash = $1 AND revoked_at IS NULL RETURNING admin_user_id`, [tokenHash, now])
        if (result.rowCount) await audit(client, result.rows[0].admin_user_id, 'logout', 'admin_user', result.rows[0].admin_user_id)
        await client.query('COMMIT')
        return result.rowCount === 1
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally { client.release() }
    },
    async recordAudit(actorId, action, targetType, targetId = null, details = {}) {
      await audit(pool, actorId, action, targetType, targetId, details)
    },
    async createFirstAdmin(emailKey, passwordHash) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('SELECT pg_advisory_xact_lock(52901002)')
        const migration = await client.query('SELECT version FROM filamind_store.schema_migrations WHERE version = 2')
        if (migration.rowCount !== 1) throw new Error('Migration 002 de autenticação não aplicada.')
        const existing = await client.query('SELECT count(*)::integer AS total FROM filamind_store.admin_users')
        if (existing.rows[0].total !== 0) throw new Error('Já existe um administrador. Nenhuma conta foi criada.')
        const userId = randomUUID()
        await client.query(`INSERT INTO filamind_store.admin_users (id, email_key, password_hash)
          VALUES ($1, $2, $3)`, [userId, emailKey, passwordHash])
        await audit(client, userId, 'first_admin_created', 'admin_user', userId)
        await client.query('COMMIT')
        return userId
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally { client.release() }
    },
  }
}
