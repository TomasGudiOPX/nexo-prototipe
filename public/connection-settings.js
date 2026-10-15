// Status chips for the connected RAGFlow origin, shared by the initial render and
// the "generate key" refresh so both stay in sync.
const originTags = (source, configured, esc) =>
  `<span class="badge gray">Origen: ${esc(source)}</span>` +
  `<span class="badge ${configured ? "active" : "error"}">Clave: ${configured ? "Configurada" : "Sin configurar"}</span>`;

export function connectionSettings(settings, esc, options = {}) {
  const generateButton = options.canGenerateKey
    ? '<button type="button" class="secondary" id="generateRagflowKey">Generar nueva clave RAGFlow</button>'
    : '';
  const generateNote = options.canGenerateKey
    ? '<p class="muted wide">Genera una clave nueva para el tenant de servicio de NEXO en la instancia conectada y la guarda cifrada. RAGFlow mantiene válida la clave anterior hasta que la elimines ahí.</p>'
    : (options.capabilityReason ? `<p class="muted wide">No se puede generar una clave desde NEXO: ${esc(options.capabilityReason)}</p>` : '');
  return `<section class="panel">
    <div class="config-head">
      <div>
        <p class="eyebrow">Servicio</p>
        <h2>Conexión RAGFlow</h2>
        <p class="muted">La clave se guarda en el servidor y nunca se devuelve al navegador. Se conserva la clave existente si dejás el campo vacío.</p>
      </div>
      <div class="config-head-side">
        <div class="config-tags" id="ragflowOrigin">${originTags(settings.source, settings.apiKeyConfigured, esc)}</div>
      </div>
    </div>
    <form id="ragflowSettings" class="config-form">
      <label>URL base RAGFlow
        <input type="url" name="baseUrl" value="${esc(settings.baseUrl || '')}" required>
      </label>
      <label>Reemplazar API key
        <input type="password" name="apiKey" autocomplete="new-password" placeholder="Se conserva la clave existente">
      </label>
      <div class="config-actions">
        <button>Guardar conexión</button>
        <button type="button" class="secondary" id="validateRagflow">Validar conexión guardada</button>
        ${generateButton}
        <button type="button" class="secondary" id="clearRagflow">Restaurar configuración de despliegue</button>
      </div>
      ${generateNote}
      <p id="ragflowSettingsMessage" class="config-status wide" role="status"></p>
    </form>
  </section>`;
}

export function bindConnectionSettings(app, post, refresh, esc) {
  const form = app.querySelector('#ragflowSettings');
  if (!form) return;
  const message = app.querySelector('#ragflowSettingsMessage');
  const run = async action => {
    const buttons = [...form.querySelectorAll('button')];
    buttons.forEach(button => { button.disabled = true; });
    message.textContent = 'Procesando…';
    try { await action(); } catch (error) { message.textContent = error.message; }
    finally { buttons.forEach(button => { button.disabled = false; }); }
  };
  form.addEventListener('submit', event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    void run(async () => { await post('/api/admin/settings/ragflow', values); form.reset(); await refresh(); });
  });
  app.querySelector('#validateRagflow').addEventListener('click', () => void run(async () => {
    const result = await post('/api/admin/settings/ragflow/validate', {});
    message.textContent = result.message;
  }));
  app.querySelector('#generateRagflowKey')?.addEventListener('click', () => {
    if (!confirm('¿Generar una nueva API key de RAGFlow y usarla desde ahora?')) return;
    void run(async () => {
      const result = await post('/api/admin/settings/ragflow', { action: 'generate-key' });
      const origin = app.querySelector('#ragflowOrigin');
      if (origin) origin.innerHTML = originTags(result.source, result.apiKeyConfigured, esc);
      message.textContent = 'Clave de RAGFlow generada y guardada.';
    });
  });
  app.querySelector('#clearRagflow').addEventListener('click', () => {
    if (!confirm('¿Restaurar la conexión definida en el despliegue?')) return;
    void run(async () => { await post('/api/admin/settings/ragflow', { action: 'clear' }); await refresh(); });
  });
}
