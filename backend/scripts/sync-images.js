import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareCatalogImport } from './import-catalog.js'
import { createSupabaseImageStorage } from '../src/supabaseImageStorage.js'

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

export async function syncImages(plan, imagesPath, storage) {
  let uploaded = 0
  let verified = 0
  for (const image of plan.images) {
    const url = `/offer-images/${image.name}`
    if (await storage.exists(url)) {
      if (sha256((await storage.read(url)).body) !== image.sha256) throw new Error(`Imagem remota diferente: ${image.name}. Nada foi sobrescrito.`)
      verified++
      continue
    }
    const buffer = await readFile(path.join(imagesPath, image.name))
    if (sha256(buffer) !== image.sha256) throw new Error(`Imagem local alterada durante a cópia: ${image.name}.`)
    await storage.saveNamed(buffer, image.name)
    if (sha256((await storage.read(url)).body) !== image.sha256) throw new Error(`Falha ao verificar a imagem enviada: ${image.name}.`)
    uploaded++
  }
  return { uploaded, verified }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  let source, images, apply = false
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--source' && args[index + 1]) source = args[++index]
    else if (args[index] === '--images' && args[index + 1]) images = args[++index]
    else if (args[index] === '--apply') apply = true
    else { console.error('Uso: npm run images:sync -- --source <catalog.json> --images <uploads> [--apply]'); process.exit(2) }
  }
  if (!source || !images) {
    console.error('Informe --source e --images. Sem --apply, o comando apenas valida os arquivos locais.')
    process.exitCode = 2
  } else {
    try {
      const plan = await prepareCatalogImport(path.resolve(source), path.resolve(images))
      if (!apply) console.log(`Pré-validação concluída: ${plan.data.products.length} produtos, ${plan.data.offers.length} ofertas e ${plan.images.length} imagens. Nenhum dado remoto foi acessado.`)
      else {
        const storage = createSupabaseImageStorage({ projectUrl: process.env.SUPABASE_URL, bucket: process.env.SUPABASE_STORAGE_BUCKET, secretKey: process.env.SUPABASE_SECRET_KEY })
        const result = await syncImages(plan, path.resolve(images), storage)
        console.log(`Imagens conferidas: ${result.verified}; enviadas e conferidas: ${result.uploaded}. O catálogo local não foi alterado.`)
      }
    } catch (error) {
      console.error('Falha na preparação ou cópia de imagens:', error.message)
      process.exitCode = 1
    }
  }
}
