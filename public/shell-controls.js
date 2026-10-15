let refreshVersion = 0;
export function setupShellControls(navigate) {
  const tools = document.querySelector('.headtools');
  tools.innerHTML = `<details class="profile-menu"><summary aria-label="Abrir menú de perfil"><span class="avatar">—</span><span class="profile-label">Mi cuenta</span><span aria-hidden="true">⌄</span></summary><div class="profile-dropdown"><strong data-profile-name>Sin sesión</strong><span data-profile-email></span><button type="button" data-settings>Configuración</button><button type="button" data-account>Iniciar sesión</button><p data-profile-error role="alert"></p></div></details>`;
  const menu = tools.querySelector('details');
  let user = null;
  tools.querySelector('[data-settings]').onclick = () => { menu.open = false; void navigate('configuration'); };
  tools.querySelector('[data-account]').onclick = async () => {
    if (!user) { menu.open = false; window.nexoSignIn(); return; }
    const button = tools.querySelector('[data-account]');
    button.disabled = true;
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!response.ok) throw new Error('No se pudo cerrar la sesión. Reintentá.');
      location.reload();
    } catch (error) { tools.querySelector('[data-profile-error]').textContent = error.message; button.disabled = false; }
  };
  document.addEventListener('click', event => { if (!menu.contains(event.target)) menu.open = false; });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); } });
  window.nexoChangeWorkspace = id => {
    const url = new URL(location.href);
    if (id) url.searchParams.set('workspaceId', id); else url.searchParams.delete('workspaceId');
    url.searchParams.delete('dataset'); url.searchParams.delete('assistantId');
    history.pushState({}, '', url);
    void navigate(url.searchParams.get('vista') || 'dashboard', { historyMode: 'none' });
  };
  async function refresh() {
    const version = ++refreshVersion;
    try {
      const response = await fetch('/api/auth/session');
      if (!response.ok) throw new Error('No se pudo cargar la cuenta.');
      const session = await response.json();
      if (version !== refreshVersion) return;
      user = session.user;
      tools.querySelector('.avatar').textContent = user?.displayName?.slice(0, 2).toUpperCase() || '—';
      tools.querySelector('[data-profile-name]').textContent = user?.displayName || 'Sin sesión';
      tools.querySelector('[data-profile-email]').textContent = user?.email || '';
      tools.querySelector('[data-account]').textContent = user ? 'Cerrar sesión' : 'Iniciar sesión';
      tools.querySelector('[data-settings]').hidden = !user;
      tools.querySelector('[data-profile-error]').textContent = '';
    } catch (error) {
      if (version !== refreshVersion) return;
      tools.querySelector('[data-profile-error]').textContent = error.message;
    }
  }
  window.addEventListener('nexo-session-changed', () => { void navigate(new URLSearchParams(location.search).get('vista') || 'dashboard', { historyMode: 'none' }); });
  window.addEventListener('nexo-workspaces-changed', () => { void refresh(); });
  return refresh;
}

