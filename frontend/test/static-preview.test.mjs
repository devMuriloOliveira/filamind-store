import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { preview } from 'vite'

test('static preview keeps public routes and assets while API and admin stay unavailable', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.equal(config.rewrites.some(({ source, destination }) => source === '/(.*)' && destination === '/index.html'), true)
  assert.equal(config.rewrites.some(({ destination }) => destination.startsWith('http')), false)

  const server = await preview({ preview: { host: '127.0.0.1', port: 0, proxy: {} } })
  let browser
  try {
    const base = server.resolvedUrls.local[0].replace(/\/$/, '')
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    for (const route of ['/', '/privacidade/', '/termos/', '/cookies/', '/reembolso/']) {
      await page.goto(base + route)
      assert.equal(await page.locator('main').count(), 1, `missing main for ${route}`)
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 900 })
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow for ${route} at ${width}px`)
      }
    }
    assert.equal((await fetch(base + '/assets/logoF-icon.png')).headers.get('content-type')?.startsWith('image/'), true)

    await page.goto(base + '/ofertas/')
    await page.getByRole('alert').getByText('Não foi possível carregar as ofertas. Tente novamente.').waitFor()
    assert.equal(await page.locator('.offer-card').count(), 0)
    assert.equal((await fetch(base + '/api/offers')).headers.get('content-type')?.includes('application/json'), false)
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `offers overflow at ${width}px`)
    }

    await page.goto(base + '/promocoes')
    await page.waitForURL(base + '/ofertas/')

    await page.goto(base + '/admin/ofertas/')
    await page.waitForURL(base + '/')
    assert.deepEqual(pageErrors, [])
  } finally {
    if (browser) await browser.close()
    await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()))
  }
})
