(() => {
  const config = window.FILAMIND_CONFIG || {};
  const systemUrl = /^https:\/\//.test(config.systemUrl || '') ? config.systemUrl : 'https://filamind.com.br/';
  document.querySelectorAll('[data-system-link]').forEach((link) => { link.href = systemUrl; });
  const proUrl = /^https:\/\//.test(config.proUrl || '') ? config.proUrl : new URL('/configuracoes/assinatura', systemUrl).href;
  document.querySelectorAll('[data-pro-link]').forEach((link) => { link.href = proUrl; });

  const menuButton = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.main-nav');
  if (menuButton && nav) {
    const closeMenu = () => {
      nav.classList.remove('is-open');
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.setAttribute('aria-label', 'Abrir menu');
    };
    menuButton.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    });
    nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
    window.addEventListener('resize', () => { if (window.innerWidth > 700) closeMenu(); });
  }

  const video = document.getElementById('product-video');
  const videoPending = document.getElementById('video-pending');
  if (video && videoPending && /^\/[^/]/.test(config.videoPath || '')) {
    video.src = config.videoPath;
    if (config.videoPoster) video.poster = config.videoPoster;
    video.hidden = false;
    videoPending.hidden = true;
    video.addEventListener('error', () => {
      video.hidden = true;
      videoPending.hidden = false;
      videoPending.querySelector('p').textContent = 'O vídeo está indisponível no momento.';
    });
  }

  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  const version = config.cookiePolicyVersion || '2026-10-27-draft';
  const storageKey = 'filamind-cookie-preferences';
  const readPreferences = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved && saved.version === version && typeof saved.analytics === 'boolean' && typeof saved.marketing === 'boolean') return saved;
    } catch { /* Armazenamento indisponível: a escolha vale nesta sessão. */ }
    return null;
  };
  let preferences = readPreferences();
  window.FILAMIND_COOKIE_PREFERENCES = preferences || { version, analytics: false, marketing: false };

  const banner = document.createElement('section');
  banner.className = 'cookie-banner';
  banner.setAttribute('aria-label', 'Preferências de cookies');
  banner.innerHTML = '<div><strong>Suas preferências de cookies</strong><p>Este site usa armazenamento local para guardar sua escolha. Não há rastreadores opcionais ativos nesta versão. Você pode escolher agora e mudar depois no rodapé. <a href="/cookies/">Leia a Política de Cookies</a>.</p></div><div class="cookie-actions"><button type="button" class="button button-primary" data-cookie-accept>Aceitar opcionais</button><button type="button" class="button button-secondary" data-cookie-reject>Rejeitar opcionais</button><button type="button" class="button button-secondary" data-cookie-customize>Personalizar</button></div>';
  banner.hidden = Boolean(preferences);
  document.body.append(banner);

  const dialog = document.createElement('dialog');
  dialog.className = 'cookie-dialog';
  dialog.setAttribute('aria-labelledby', 'cookie-dialog-title');
  dialog.innerHTML = '<h2 id="cookie-dialog-title">Personalizar cookies</h2><p>Necessários: armazenamento da sua escolha. Estão sempre ativos. Analytics e marketing não são usados atualmente.</p><label><input type="checkbox" id="cookie-analytics"> Analíticos <small>Permissão para uma integração futura; nenhuma está ativa.</small></label><label><input type="checkbox" id="cookie-marketing"> Marketing <small>Permissão para uma integração futura; nenhuma está ativa.</small></label><div class="cookie-actions"><button type="button" class="button button-primary" data-cookie-save>Salvar preferências</button><button type="button" class="button button-secondary" data-cookie-close>Fechar</button></div>';
  document.body.append(dialog);
  let returnFocus = null;
  const save = (analytics, marketing) => {
    preferences = { version, analytics, marketing, savedAt: new Date().toISOString() };
    window.FILAMIND_COOKIE_PREFERENCES = preferences;
    try { localStorage.setItem(storageKey, JSON.stringify(preferences)); } catch { /* A escolha vale nesta sessão. */ }
    banner.hidden = true;
    if (dialog.open) dialog.close();
  };
  const openDialog = (trigger) => {
    returnFocus = trigger;
    dialog.querySelector('#cookie-analytics').checked = preferences?.analytics || false;
    dialog.querySelector('#cookie-marketing').checked = preferences?.marketing || false;
    dialog.showModal();
    dialog.querySelector('#cookie-analytics').focus();
  };
  banner.querySelector('[data-cookie-accept]').addEventListener('click', () => save(true, true));
  banner.querySelector('[data-cookie-reject]').addEventListener('click', () => save(false, false));
  banner.querySelector('[data-cookie-customize]').addEventListener('click', (event) => openDialog(event.currentTarget));
  dialog.querySelector('[data-cookie-save]').addEventListener('click', () => save(dialog.querySelector('#cookie-analytics').checked, dialog.querySelector('#cookie-marketing').checked));
  dialog.querySelector('[data-cookie-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => returnFocus?.focus());
  document.querySelectorAll('[data-cookie-open]').forEach((button) => button.addEventListener('click', () => openDialog(button)));
})();
