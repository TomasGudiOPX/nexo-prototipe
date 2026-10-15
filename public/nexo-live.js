import { setupShellControls } from './shell-controls.js';
import { mountWorkspaceArea, suspendWorkspaceArea } from './workspace.js';

const areas = new Map([
  ['workspaces', 'Espacios de trabajo'], ['knowledge', 'Documentos'],
  ['assistants', 'Asistentes disponibles'], ['activity', 'Actividad'],
  ['reports', 'Reportes'], ['configuration', 'Configuración'],
]);
const aliases = { projects: 'workspaces', project: 'workspaces', documents: 'knowledge', alerts: 'activity', settings: 'configuration' };
let navigationVersion = 0;
let shellInitialized = false;
const refreshShell = setupShellControls(navigate);

async function navigate(destination, { historyMode = 'push' } = {}) {
  const area = aliases[destination] || destination;
  const version = ++navigationVersion;
  if (!areas.has(area) && !['dashboard', 'assistant'].includes(area)) return;
  suspendWorkspaceArea();
  window.nexoSuspendContext?.();
  const url = new URL(location.href);
  if (area === 'dashboard') url.searchParams.delete('vista'); else url.searchParams.set('vista', area);
  url.searchParams.delete('project'); url.searchParams.delete('tab'); url.searchParams.delete('area');
  if (historyMode !== 'none' && url.href !== location.href) history[historyMode === 'replace' ? 'replaceState' : 'pushState']({}, '', url);
  document.querySelectorAll('.screen').forEach(node => node.classList.toggle('active', node.id === `screen-${area}`));
  document.querySelectorAll('#navigation button').forEach(node => node.classList.toggle('active', node.id === `nav-${area}`));
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('breadcrumb').textContent = areas.get(area)?.toUpperCase() || (area === 'dashboard' ? 'CENTRO DE INTELIGENCIA' : 'ASISTENTE DE INTELIGENCIA');
  await refreshShell();
  if (version !== navigationVersion) return;
  if (!areas.has(area)) { suspendWorkspaceArea(); await window.nexoRefreshContext(); shellInitialized = true; if (version === navigationVersion && area === 'assistant') window.renderChat(); return; }
  const target = document.getElementById(`screen-${area}`);
  // Landing straight on an operational view skips the dashboard bootstrap, so the
  // shared shell (session + workspace selector) would stay empty. Initialize it once.
  if (!shellInitialized) {
    shellInitialized = true;
    await window.nexoRefreshContext?.();
    if (version !== navigationVersion) return;
    document.getElementById('breadcrumb').textContent = areas.get(area)?.toUpperCase() || 'NEXO';
  }
  window.nexoSuspendContext?.();
  await mountWorkspaceArea(target, area, (nextArea, workspaceId) => {
    const next = new URL(location.href);
    if (workspaceId) next.searchParams.set('workspaceId', workspaceId); else next.searchParams.delete('workspaceId');
    next.searchParams.delete('assistantId');
    history.replaceState({}, '', next);
    void navigate(nextArea);
  });
}

window.go = destination => navigate(destination);
window.nexoWorkspaceArea = area => window.go(area === 'home' ? 'dashboard' : area);
window.globalLookup = () => {
  const query = document.getElementById('globalSearch').value.trim();
  if (!query) return;
  // Search the connected source via the assistant; no local demonstration catalog.
  void navigate('assistant').then(() => { document.getElementById('chatInput').value = query; document.getElementById('chatInput').focus(); });
};
window.addEventListener('popstate', () => { void navigate(new URLSearchParams(location.search).get('vista') || 'dashboard', { historyMode: 'none' }); });
void navigate(new URLSearchParams(location.search).get('vista') || 'dashboard', { historyMode: 'replace' });
