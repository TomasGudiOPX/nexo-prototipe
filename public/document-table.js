const views = new Map();
const statuses = {
  UNSTART: 'Pendiente',
  CREATED: 'Pendiente',
  SCHEDULED: 'En cola',
  RUNNING: 'Procesando',
  STOPPING: 'Deteniendo',
  STOPPED: 'Detenido',
  COMPLETED: 'Completado',
  FAILED: 'Error',
  UNKNOWN: 'Desconocido'
};

const statusKey = value => ({ '0': 'UNSTART', '1': 'RUNNING', '2': 'STOPPED', '3': 'COMPLETED', '4': 'FAILED' })[value] || (String(value).toUpperCase() in statuses ? String(value).toUpperCase() : 'UNKNOWN');

const number = value => value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('es-AR');

function date(value) {
  if (!value) return '—';
  const parsed = new Date(/^\d+$/.test(String(value)) ? Number(value) : value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

function size(value) {
  if (value == null) return '—';
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return '—';
  return bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

function fileExt(name) {
  if (!name || typeof name !== 'string') return 'DOC';
  const parts = name.split('.');
  if (parts.length < 2) return 'DOC';
  const ext = parts.pop().toUpperCase();
  return ext.length <= 4 ? ext : ext.slice(0, 4);
}

export function documentTableMarkup(data, esc) {
  return `<section class="panel document-manager" data-document-table="${esc(JSON.stringify(data))}"></section>`;
}

export function bindDocumentTable(app, { api, post, esc }) {
  const root = app.querySelector('[data-document-table]');
  if (!root) return;
  const data = JSON.parse(root.dataset.documentTable);
  root.removeAttribute('data-document-table');

  let documents = data.documents || [];
  const view = views.get(data.endpoint) || { query: '', status: '', sort: 'name', direction: 1, page: 1, pageSize: 20, selected: new Set() };
  views.set(data.endpoint, view);
  if (views.size > 10) views.delete(views.keys().next().value);

  const prune = () => {
    const ids = new Set(documents.map(row => row.id));
    for (const id of view.selected) if (!ids.has(id)) view.selected.delete(id);
  };
  prune();

  let busy = false;
  let activeDetailDoc = null;

  root.innerHTML = `
    <div class="doc-top-bar">
      <div class="doc-filters">
        ${data.datasets && data.datasets.length ? `
          <label style="min-width: 200px">
            <span>Dataset activo</span>
            <select id="datasetSelect">
              ${data.datasets.map(d => `<option value="${esc(d.id)}" ${d.id === data.datasetId ? "selected" : ""}>${esc(d.name)}</option>`).join('')}
            </select>
          </label>
        ` : ''}
        <label>
          <span>Buscar</span>
          <input type="search" data-search placeholder="Nombre de archivo…">
        </label>
        <label>
          <span>Estado</span>
          <select data-status>
            <option value="">Todos los estados</option>
            ${Object.entries(statuses).map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}
          </select>
        </label>
        <button type="button" data-refresh title="Recargar listado">↻ Actualizar</button>
      </div>
      <div class="doc-pagination">
        <span data-page-info></span>
        <label>Por página
          <select data-page-size>
            <option>20</option>
            <option>50</option>
            <option>100</option>
          </select>
        </label>
        <button type="button" data-prev>Anterior</button>
        <button type="button" data-next>Siguiente</button>
      </div>
    </div>

    <div class="doc-overview" data-overview></div>

    <div class="doc-bulk" data-bulk-bar>
      ${data.canManage ? `
        <span data-selection>0 seleccionados</span>
        <button type="button" data-select-results>Seleccionar página</button>
        <button type="button" data-clear>Limpiar</button>
        <button type="button" class="btn-primary" data-action="process">Procesar</button>
        <button type="button" data-action="retry">Reprocesar</button>
        ${data.pipeline ? '' : '<button type="button" data-action="stop">Detener</button>'}
      ` : '<span>Acceso de consulta</span>'}
    </div>

    <p role="status" data-message></p>

    <div class="table-wrap">
      <table class="document-table">
        <caption class="doc-caption">Documentos en la fuente seleccionada</caption>
        <thead>
          <tr>
            ${data.canManage ? '<th style="width: 40px"><input type="checkbox" data-all aria-label="Seleccionar todos los de esta página"></th>' : ''}
            <th data-sort-heading="name"><button type="button" data-sort="name">Documento ↕</button></th>
            <th>Estado</th>
            <th data-sort-heading="chunks"><button type="button" data-sort="chunks">Fragmentos ↕</button></th>
            <th data-sort-heading="updatedAt"><button type="button" data-sort="updatedAt">Actualización ↕</button></th>
            <th style="width: 80px; text-align: right">Acción</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>

    <div class="doc-drawer-backdrop" data-drawer-backdrop></div>
    <aside class="doc-drawer" data-drawer aria-label="Detalle de documento">
      <div class="doc-drawer-head">
        <div>
          <small class="eyebrow">Detalles del documento</small>
          <h3 data-drawer-title>Documento</h3>
        </div>
        <button type="button" class="doc-drawer-close" data-drawer-close aria-label="Cerrar panel">✕</button>
      </div>
      <div class="doc-drawer-body" data-drawer-content></div>
    </aside>

    <div class="doc-confirm-dialog" data-confirm-dialog hidden>
      <div class="doc-confirm-box" role="dialog" aria-modal="true" aria-labelledby="docConfirmTitle">
        <h4 id="docConfirmTitle">Confirmar acción</h4>
        <p data-confirm-message></p>
        <div class="doc-confirm-actions">
          <button type="button" data-confirm-cancel>Cancelar</button>
          <button type="button" class="btn-primary" data-confirm-proceed>Confirmar</button>
        </div>
      </div>
    </div>
  `;

  const message = root.querySelector('[data-message]');
  const bulkBar = root.querySelector('[data-bulk-bar]');
  const drawer = root.querySelector('[data-drawer]');
  const drawerBackdrop = root.querySelector('[data-drawer-backdrop]');
  const confirmDialog = root.querySelector('[data-confirm-dialog]');

  const filtered = () => documents
    .filter(row => (row.name || '').toLocaleLowerCase().includes(view.query.toLocaleLowerCase()) &&
      (!view.status || statusKey(row.status) === view.status))
    .sort((a, b) => {
      const left = a[view.sort], right = b[view.sort];
      if (view.sort === 'name') return String(left || '').localeCompare(String(right || ''), 'es', { numeric: true }) * view.direction;
      return (Number(left || 0) - Number(right || 0)) * view.direction;
    });

  const pageRows = () => filtered().slice((view.page - 1) * view.pageSize, view.page * view.pageSize);

  function selection() {
    if (!data.canManage) return;
    const visible = pageRows();
    const count = visible.filter(row => view.selected.has(row.id)).length;
    const all = root.querySelector('[data-all]');
    if (all) {
      all.checked = visible.length > 0 && count === visible.length;
      all.indeterminate = count > 0 && count < visible.length;
      all.disabled = busy || !visible.length;
    }

    const matching = new Set(filtered().map(row => row.id));
    const hidden = [...view.selected].filter(id => !matching.has(id)).length;

    const selectionText = root.querySelector('[data-selection]');
    if (selectionText) {
      selectionText.textContent = `${view.selected.size} seleccionado${view.selected.size === 1 ? '' : 's'}${hidden ? ` · ${hidden} fuera de filtro` : ''}`;
    }

    if (view.selected.size > 0) {
      bulkBar.classList.add('active');
    } else {
      bulkBar.classList.remove('active');
    }

    root.querySelectorAll('[data-action]').forEach(button => {
      button.disabled = busy || !view.selected.size;
    });

    root.querySelectorAll('[data-row]').forEach(box => {
      box.disabled = busy;
      box.checked = view.selected.has(box.dataset.row);
      box.closest('tr')?.classList.toggle('selected', box.checked);
    });
  }

  function openDrawer(doc) {
    activeDetailDoc = doc;
    const key = statusKey(doc.status);
    const progress = doc.progress != null && Number.isFinite(doc.progress) && doc.progress >= 0 ? Math.round(Math.min(1, doc.progress) * 100) : null;

    root.querySelector('[data-drawer-title]').textContent = doc.name;
    const content = root.querySelector('[data-drawer-content]');

    content.innerHTML = `
      <div class="doc-prop-list">
        <span class="doc-prop-label">Identificador</span>
        <span class="doc-prop-value">
          <span class="doc-id-badge">
            ${esc(doc.id)}
            <button type="button" class="doc-copy-btn" data-copy-id="${esc(doc.id)}">Copiar</button>
          </span>
        </span>

        <span class="doc-prop-label">Estado</span>
        <span class="doc-prop-value">
          <span class="doc-state" data-state="${key}">${statuses[key]}</span>
          ${progress == null ? '' : `<small style="margin-left: 6px">${progress}%</small>`}
        </span>

        <span class="doc-prop-label">Recuperación</span>
        <span class="doc-prop-value">${doc.enabled == null ? 'Desconocida' : doc.enabled ? 'Habilitada para IA' : 'Deshabilitada'}</span>

        <span class="doc-prop-label">Fragmentos</span>
        <span class="doc-prop-value">${number(doc.chunks)}</span>

        <span class="doc-prop-label">Tokens</span>
        <span class="doc-prop-value">${number(doc.tokens)}</span>

        <span class="doc-prop-label">Tamaño</span>
        <span class="doc-prop-value">${size(doc.size)}</span>

        <span class="doc-prop-label">Método / Pipeline</span>
        <span class="doc-prop-value">${esc(doc.pipeline || doc.parser || 'Predeterminado')}</span>

        <span class="doc-prop-label">Creado</span>
        <span class="doc-prop-value">${esc(date(doc.createdAt))}</span>

        <span class="doc-prop-label">Actualizado</span>
        <span class="doc-prop-value">${esc(date(doc.updatedAt))}</span>
      </div>

      <div>
        <h4 style="margin: 0 0 8px; font-size: 13px">Registro de procesamiento</h4>
        <div class="doc-log-box">${esc(doc.progressMessage || 'Sin mensajes de procesamiento reportados.')}</div>
      </div>

      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px">
          <h4 style="margin: 0; font-size: 13px">Metadatos</h4>
          <button type="button" class="doc-copy-btn" data-toggle-json>Ver JSON sin procesar</button>
        </div>
        <div data-meta-readable class="doc-prop-list" style="background: #0d1214; padding: 10px; border-radius: 8px; border: 1px solid #212c2a">
          ${doc.metadata && Object.keys(doc.metadata).length
            ? Object.entries(doc.metadata).map(([k, v]) => `
                <span class="doc-prop-label">${esc(k)}</span>
                <span class="doc-prop-value">${esc(typeof v === 'object' ? JSON.stringify(v) : String(v))}</span>
              `).join('')
            : '<span class="muted" style="grid-column: 1 / -1">Sin metadatos personalizados.</span>'}
        </div>
        <pre data-meta-json class="doc-log-box" style="display: none; margin-top: 6px">${esc(JSON.stringify(doc.metadata || {}, null, 2))}</pre>
      </div>
    `;

    drawer.classList.add('open');
    drawerBackdrop.classList.add('open');
  }

  function closeDrawer() {
    activeDetailDoc = null;
    drawer.classList.remove('open');
    drawerBackdrop.classList.remove('open');
  }

  function showConfirm(msg) {
    return new Promise(resolve => {
      confirmDialog.querySelector('[data-confirm-message]').textContent = msg;
      confirmDialog.hidden = false;
      const onProceed = () => { cleanup(); resolve(true); };
      const onCancel = () => { cleanup(); resolve(false); };
      const cleanup = () => {
        confirmDialog.hidden = true;
        proceedBtn.removeEventListener('click', onProceed);
        cancelBtn.removeEventListener('click', onCancel);
      };
      const proceedBtn = confirmDialog.querySelector('[data-confirm-proceed]');
      const cancelBtn = confirmDialog.querySelector('[data-confirm-cancel]');
      proceedBtn.addEventListener('click', onProceed);
      cancelBtn.addEventListener('click', onCancel);
    });
  }

  function draw() {
    const rows = filtered();
    const pages = Math.max(1, Math.ceil(rows.length / view.pageSize));
    view.page = Math.min(view.page, pages);

    const completedCount = documents.filter(row => statusKey(row.status) === 'COMPLETED').length;
    const failedCount = documents.filter(row => statusKey(row.status) === 'FAILED').length;
    root.querySelector('[data-overview]').textContent = `${documents.length} documentos · ${completedCount} completados · ${failedCount} con error${documents.length >= 1000 ? ' · Vista limitada a 1000' : ''}`;

    const displayed = pageRows();
    const colCount = data.canManage ? 6 : 5;

    root.querySelector('tbody').innerHTML = displayed.map(row => {
      const key = statusKey(row.status);
      const ext = fileExt(row.name);
      const activeState = ['RUNNING', 'SCHEDULED'].includes(key);
      const progress = row.progress != null && Number.isFinite(row.progress) && row.progress >= 0 ? Math.round(Math.min(1, row.progress) * 100) : null;

      return `
        <tr>
          ${data.canManage ? `<td><input type="checkbox" data-row="${esc(row.id)}" aria-label="Seleccionar ${esc(row.name)}"></td>` : ''}
          <td>
            <div class="doc-name-cell">
              <span class="doc-ext-badge" data-ext="${esc(ext)}">${esc(ext)}</span>
              <span class="doc-name-text" title="${esc(row.name)}">${esc(row.name)}</span>
            </div>
          </td>
          <td>
            <span class="doc-state" data-state="${key}">${statuses[key]}</span>
            ${activeState && progress != null ? `
              <div class="doc-progress-wrap">
                <progress max="100" value="${progress}" aria-label="Progreso"></progress>
                <small>${progress}%</small>
              </div>
            ` : ''}
          </td>
          <td>${number(row.chunks)}</td>
          <td>${esc(date(row.updatedAt || row.createdAt))}</td>
          <td style="text-align: right">
            <button type="button" data-open-detail="${esc(row.id)}" title="Ver detalles y metadatos">Detalles</button>
          </td>
        </tr>
      `;
    }).join('') || `<tr><td colspan="${colCount}" class="empty">${documents.length ? 'No hay documentos que coincidan con la búsqueda o filtro.' : 'Este dataset todavía no tiene documentos cargados.'}</td></tr>`;

    root.querySelector('[data-page-info]').textContent = rows.length ? `Página ${view.page} de ${pages}` : 'Sin resultados';
    root.querySelector('[data-prev]').disabled = busy || view.page === 1;
    root.querySelector('[data-next]').disabled = busy || view.page === pages;
    root.querySelector('[data-prev]').hidden = pages <= 1;
    root.querySelector('[data-next]').hidden = pages <= 1;
    root.querySelector('[data-page-size]').value = String(view.pageSize);

    root.querySelectorAll('[data-sort-heading]').forEach(th => {
      th.setAttribute('aria-sort', th.dataset.sortHeading === view.sort ? (view.direction === 1 ? 'ascending' : 'descending') : 'none');
    });

    selection();
  }

  function lock(value) {
    busy = value;
    root.querySelectorAll('button:not(.doc-drawer-close),input,select').forEach(node => { node.disabled = value; });
    draw();
  }

  async function refresh() {
    const result = await api(data.endpoint);
    if (!root.isConnected) return;
    documents = result.documents || [];
    prune();
    draw();
  }

  root.querySelector('[data-search]').value = view.query;
  root.querySelector('[data-status]').value = view.status;
  root.querySelector('[data-page-size]').value = view.pageSize;

  root.addEventListener('input', event => {
    if (event.target.matches('[data-search]')) {
      view.query = event.target.value;
      view.page = 1;
      draw();
    }
  });

  root.addEventListener('change', event => {
    const target = event.target;
    if (target.matches('[data-status]')) {
      view.status = target.value;
      view.page = 1;
      draw();
    }
    if (target.matches('[data-page-size]')) {
      view.pageSize = Number(target.value);
      view.page = 1;
      draw();
    }
    if (target.matches('[data-all]')) {
      pageRows().forEach(row => target.checked ? view.selected.add(row.id) : view.selected.delete(row.id));
      selection();
    }
    if (target.matches('[data-row]')) {
      target.checked ? view.selected.add(target.dataset.row) : view.selected.delete(target.dataset.row);
      selection();
    }
  });

  root.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;

    if (button.matches('[data-drawer-close]') || event.target.matches('[data-drawer-backdrop]')) {
      closeDrawer();
      return;
    }

    if (button.dataset.copyId) {
      try {
        await navigator.clipboard.writeText(button.dataset.copyId);
        button.textContent = 'Copiado!';
        setTimeout(() => { if (button.isConnected) button.textContent = 'Copiar'; }, 1500);
      } catch {
        button.textContent = 'Error';
      }
      return;
    }

    if (button.matches('[data-toggle-json]')) {
      const readable = root.querySelector('[data-meta-readable]');
      const json = root.querySelector('[data-meta-json]');
      if (readable && json) {
        const isJson = json.style.display !== 'none';
        json.style.display = isJson ? 'none' : 'block';
        readable.style.display = isJson ? 'grid' : 'none';
        button.textContent = isJson ? 'Ver JSON sin procesar' : 'Ver campos legibles';
      }
      return;
    }

    if (button.dataset.openDetail) {
      const doc = documents.find(d => d.id === button.dataset.openDetail);
      if (doc) openDrawer(doc);
      return;
    }

    if (busy) return;

    if (button.dataset.sort) {
      view.direction = view.sort === button.dataset.sort ? -view.direction : 1;
      view.sort = button.dataset.sort;
      draw();
    }
    if (button.matches('[data-prev]')) { view.page--; draw(); }
    if (button.matches('[data-next]')) { view.page++; draw(); }
    if (button.matches('[data-select-results]')) {
      pageRows().forEach(row => view.selected.add(row.id));
      selection();
    }
    if (button.matches('[data-clear]')) {
      view.selected.clear();
      selection();
    }
    if (button.matches('[data-refresh]')) {
      lock(true);
      try {
        await refresh();
        message.textContent = 'Estado actualizado desde RAGFlow.';
      } catch (error) {
        message.textContent = error.message;
      } finally {
        lock(false);
      }
    }

    if (button.dataset.action) {
      const action = button.dataset.action;
      const selected = documents.filter(row => view.selected.has(row.id));
      const active = row => ['RUNNING', 'SCHEDULED', 'STOPPING'].includes(statusKey(row.status));
      const eligible = selected.filter(row => action === 'stop' ? active(row) : !active(row) && (action === 'retry' || statusKey(row.status) !== 'COMPLETED'));

      if (!eligible.length) {
        message.textContent = 'Ninguno de los documentos seleccionados admite esta acción en su estado actual.';
        return;
      }

      const promptMsg = `${button.textContent} ${eligible.length} documentos${eligible.length !== selected.length ? ` (${selected.length - eligible.length} omitidos por su estado)` : ''}.${action === 'retry' ? ' Se reconstruirán sus fragmentos.' : ''} ¿Continuar?`;
      const confirmed = await showConfirm(promptMsg);
      if (!confirmed) return;

      lock(true);
      message.textContent = 'Enviando solicitud…';
      try {
        await post(data.endpoint, { action, documentIds: eligible.map(row => row.id) });
        view.selected.clear();
        message.textContent = `Solicitud enviada para ${eligible.length} documentos. Actualizá para consultar el progreso.`;
        try { await refresh(); } catch { message.textContent += ' No se pudo actualizar el listado.'; }
      } catch (error) {
        message.textContent = error.message;
      } finally {
        lock(false);
      }
    }
  });

  drawerBackdrop.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && drawer.classList.contains('open')) {
      closeDrawer();
    }
  });

  draw();
}
