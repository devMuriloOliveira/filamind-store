import { emitKeypressEvents } from 'node:readline'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFirstAdmin, normalizeAdminEmail } from '../src/adminAuth.js'
import { createPostgresPool } from '../src/postgresRepository.js'
import { createPostgresAdminAuthStore } from '../src/postgresAdminAuthStore.js'

function readHidden(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Execute em um terminal interativo para digitar a senha sem eco.')
  return new Promise((resolve, reject) => {
    let value = ''
    const wasRaw = Boolean(process.stdin.isRaw)
    const finish = (error) => {
      process.stdin.removeListener('keypress', onKey)
      process.stdin.setRawMode(wasRaw)
      process.stdin.pause()
      process.stdout.write('\n')
      if (error) reject(error)
      else resolve(value)
    }
    const onKey = (input, key) => {
      if (key?.ctrl && key.name === 'c') return finish(new Error('Operação cancelada.'))
      if (key?.name === 'return' || key?.name === 'enter') return finish()
      if (key?.name === 'backspace') { value = [...value].slice(0, -1).join(''); return }
      if (input && !key?.ctrl && !key?.meta && !/[\u0000-\u001f\u007f]/.test(input)) value += input
    }
    process.stdout.write(prompt)
    emitKeypressEvents(process.stdin)
    process.stdin.setRawMode(true)
    process.stdin.on('keypress', onKey)
    process.stdin.resume()
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const index = args.indexOf('--email')
  if (args.length !== 3 || args[0] !== '--create' || index !== 1 || !args[2]) {
    console.error('Uso: npm run admin:create -- --create --email <seu-email>. A senha é solicitada sem eco.')
    process.exitCode = 2
  } else {
    let pool
    try {
      const email = normalizeAdminEmail(args[2])
      if (process.env.FILAMIND_STORAGE !== 'postgres' || !process.env.DATABASE_URL) throw new Error('Configure PostgreSQL no backend antes de criar o administrador.')
      pool = createPostgresPool(process.env.DATABASE_URL)
      const store = createPostgresAdminAuthStore(pool)
      await store.assertReady()
      const password = await readHidden('Senha administrativa: ')
      const confirmation = await readHidden('Confirme a senha: ')
      if (password !== confirmation) throw new Error('As senhas não conferem. Nenhuma conta foi criada.')
      await createFirstAdmin(store, email, password)
      console.log('Primeiro administrador criado. A senha não foi exibida nem gravada em arquivo.')
    } catch (error) {
      const expected = ['E-mail administrativo inválido.', 'Execute em um terminal interativo para digitar a senha sem eco.',
        'Operação cancelada.', 'Configure PostgreSQL no backend antes de criar o administrador.',
        'As senhas não conferem. Nenhuma conta foi criada.', 'Já existe um administrador. Nenhuma conta foi criada.',
        'Use uma senha única de 16 a 128 caracteres, sem caracteres de controle ou o e-mail.']
      console.error(expected.includes(error.message) ? error.message : 'Falha ao criar o administrador. Nenhuma credencial foi exibida.')
      process.exitCode = 1
    } finally { await pool?.end() }
  }
}
