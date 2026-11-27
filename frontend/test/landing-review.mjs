import { chromium } from 'playwright'
import assert from 'node:assert/strict'

const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const phase = process.argv[2] || 'after'
const widths = [1440, 1200, 1024, 768, 390, 320]

try {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
    const data = await page.evaluate(() => ({
      title: document.title,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      brokenImages: [...document.images].filter(image => !image.complete || image.naturalWidth === 0).map(image => image.src),
      heading: document.querySelector('h1')?.textContent,
      anchors: [...document.querySelectorAll('main a[href^="#"]')].map(link => ({ href: link.getAttribute('href'), exists: !!document.querySelector(link.getAttribute('href')) })),
    }))
    await page.screenshot({ path: `test-results/landing-${phase}-${width}.png`, fullPage: true })
    assert.equal(data.horizontalOverflow, false, `Rolagem horizontal em ${width}px`)
    assert.deepEqual(data.brokenImages, [], `Imagens quebradas em ${width}px`)
    assert(data.anchors.every(anchor => anchor.exists), `Âncora sem destino em ${width}px`)
    assert.deepEqual(errors, [], `Erro de página em ${width}px`)
    console.log(JSON.stringify({ width, ...data, errors }))
    await page.close()
  }
  if (phase === 'after') {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
    const externalLinks = await page.locator('main a[target="_blank"]').evaluateAll(links => links.map(link => link.href))
    assert(externalLinks.length >= 4 && externalLinks.every(url => url.startsWith('https://filamind.com.br/')))
    await page.getByRole('button', { name: 'Abrir menu' }).click()
    assert.equal(await page.locator('#main-nav').isVisible(), true)
    await page.locator('#main-nav').getByRole('link', { name: 'Funcionalidades' }).click()
    assert.equal(new URL(page.url()).hash, '#funcionalidades')
    assert.equal(await page.locator('#main-nav').isVisible(), false)
    await page.getByRole('button', { name: 'Rejeitar opcionais' }).click()
    assert.equal(await page.locator('.cookie-banner').count(), 0)
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('filamind-cookie-preferences')))
    assert.equal(saved.analytics, false)
    assert.equal(saved.marketing, false)
    await page.getByRole('button', { name: 'Preferências de cookies' }).click()
    assert.equal(await page.locator('.cookie-dialog').isVisible(), true)
    await page.getByRole('button', { name: 'Fechar' }).click()
    assert.equal(await page.locator('.plan-details').getAttribute('open'), null)
    await page.locator('.plan-details summary').click()
    assert.equal(await page.locator('.plan-comparison').isVisible(), true)
    await page.goto('http://127.0.0.1:4173/ofertas/', { waitUntil: 'networkidle' })
    assert.equal(await page.locator('.offers-main').count(), 1)
    console.log(JSON.stringify({ interactions: 'menu, anchors, CTAs, cookies, plan details, offers route', status: 'passed' }))
    await page.close()
  }
} finally {
  await browser.close()
}
