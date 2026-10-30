import { ref, nextTick } from 'vue'
import { cookiePolicyVersion } from '../config.js'

const storageKey = 'filamind-cookie-preferences'
function readPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
    if (saved && saved.version === cookiePolicyVersion && typeof saved.analytics === 'boolean' && typeof saved.marketing === 'boolean') return saved
  } catch { /* Armazenamento indisponível: a escolha vale nesta sessão. */ }
  return null
}

const preferences = ref(readPreferences())
const dialogOpen = ref(false)
const analytics = ref(false)
const marketing = ref(false)
let returnFocus = null
if (typeof window !== 'undefined') {
  window.FILAMIND_COOKIE_PREFERENCES = preferences.value || { version: cookiePolicyVersion, analytics: false, marketing: false }
}

export function useCookiePreferences() {
  const openDialog = async (trigger) => {
    returnFocus = trigger
    analytics.value = preferences.value?.analytics || false
    marketing.value = preferences.value?.marketing || false
    dialogOpen.value = true
    await nextTick()
    const dialog = document.querySelector('.cookie-dialog')
    dialog.showModal()
    dialog.querySelector('#cookie-analytics').focus()
  }
  const closeDialog = () => document.querySelector('.cookie-dialog')?.close()
  const onDialogClose = () => {
    dialogOpen.value = false
    returnFocus?.focus()
  }
  const save = (allowAnalytics, allowMarketing) => {
    preferences.value = { version: cookiePolicyVersion, analytics: allowAnalytics, marketing: allowMarketing, savedAt: new Date().toISOString() }
    window.FILAMIND_COOKIE_PREFERENCES = preferences.value
    try { localStorage.setItem(storageKey, JSON.stringify(preferences.value)) } catch { /* A escolha vale nesta sessão. */ }
    closeDialog()
  }
  return { preferences, dialogOpen, analytics, marketing, openDialog, closeDialog, onDialogClose, save }
}
