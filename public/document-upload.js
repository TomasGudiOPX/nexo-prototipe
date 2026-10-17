export function openDocumentUpload({ endpoint, datasetName, upload, onComplete }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'nexo-upload';
  dialog.setAttribute('aria-labelledby', 'uploadTitle');
    dialog.innerHTML = `<div class="upload-heading"><h2 id="uploadTitle">Subir documentos</h2><button type="button" data-close aria-label="Cerrar">×</button></div><p data-destination></p><p>Elegí archivos o una carpeta con sus subcarpetas. Los archivos se agregan a la fuente como documentos individuales; no se crean carpetas.</p><div class="upload-options"><button type="button" data-files>Seleccionar archivos</button><button type="button" data-folder>Seleccionar carpeta</button></div><input type="file" data-file-input multiple hidden><input type="file" data-folder-input webkitdirectory multiple hidden><p data-support hidden>Este navegador no permite seleccionar carpetas. Usá la opción de archivos.</p><p data-summary role="status">No seleccionaste archivos.</p><ul data-list aria-label="Archivos seleccionados"></ul><p data-status role="status" aria-live="polite"></p><div class="upload-actions"><button type="button" data-stop-queue style="display:none" class="secondary">Detener cola</button><button type="button" data-close>Cancelar</button><button type="button" data-submit disabled>Subir a RAGFlow</button></div>`;
  dialog.querySelector('[data-destination]').textContent = `Fuente: ${datasetName}`;
  const fileInput = dialog.querySelector('[data-file-input]');
  const folderInput = dialog.querySelector('[data-folder-input]');
  const submit = dialog.querySelector('[data-submit]');
  const status = dialog.querySelector('[data-status]');
  const list = dialog.querySelector('[data-list]');
  let entries = [], busy = false, uploaded = 0;
  if (!('webkitdirectory' in folderInput)) {
    dialog.querySelector('[data-folder]').disabled = true;
    dialog.querySelector('[data-support]').hidden = false;
  }
  const close = () => { if (!busy) dialog.close(); };
  dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', close));
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => { dialog.remove(); if (uploaded) void onComplete(); }, { once: true });
  dialog.querySelector('[data-files]').addEventListener('click', () => { fileInput.value = ''; fileInput.click(); });
  dialog.querySelector('[data-folder]').addEventListener('click', () => { folderInput.value = ''; folderInput.click(); });
  function selectFiles(input) {
    if (!input.files.length) return;
    entries = [...input.files].map(file => ({ file, row: document.createElement('li') }));
    list.replaceChildren();
    const names = new Set();
    let duplicates = false;
    for (const entry of entries) {
      entry.row.textContent = entry.file.webkitRelativePath || entry.file.name;
      list.append(entry.row);
      if (names.has(entry.file.name)) duplicates = true;
      names.add(entry.file.name);
    }
    const bytes = entries.reduce((sum, entry) => sum + entry.file.size, 0);
    dialog.querySelector('[data-summary]').textContent = `${entries.length} archivos · ${(bytes / 1024 / 1024).toFixed(2)} MB`;
    status.textContent = duplicates ? 'Hay archivos con el mismo nombre en distintas carpetas. Se enviarán por separado con sus nombres originales.' : '';
    submit.disabled = !entries.length;
  }
  fileInput.addEventListener('change', () => selectFiles(fileInput));
  folderInput.addEventListener('change', () => selectFiles(folderInput));
  submit.addEventListener('click', async () => {
    if (busy || !entries.length) return;
    busy = true;
    const stopBtn = dialog.querySelector('[data-stop-queue]');
    let stopRequested = false;
    stopBtn.style.display = 'inline-flex';
    stopBtn.disabled = false;
    const onStop = () => {
      stopRequested = true;
      stopBtn.disabled = true;
      status.textContent = 'Deteniendo cola tras el archivo actual…';
    };
    stopBtn.addEventListener('click', onStop);

    let failed = 0;
    for (const [index, entry] of entries.entries()) {
      if (stopRequested) {
        entry.row.textContent = `${entry.file.webkitRelativePath || entry.file.name} · Omitido por cancelación`;
        continue;
      }
      status.textContent = `Subiendo ${index + 1} de ${entries.length}…`;
      const name = entry.file.webkitRelativePath || entry.file.name;
      entry.row.textContent = `${name} · Subiendo…`;
      const form = new FormData();
      form.append('file', entry.file, entry.file.name);
      try {
        await upload(endpoint, { method: 'POST', body: form });
        uploaded++;
        entry.row.textContent = `${name} · Subido`;
      } catch (error) {
        failed++;
        entry.row.textContent = `${name} · Error: ${error.message}`;
      }
    }
    busy = false;
    stopBtn.removeEventListener('click', onStop);
    stopBtn.style.display = 'none';
    status.textContent = `${uploaded} archivos subidos · ${failed} con error${stopRequested ? ' · Cola detenida por el usuario' : ''}. ${failed ? 'Revisá el listado de la fuente antes de volver a enviar los archivos con error.' : 'Podés cerrar y seleccionar los documentos para procesarlos.'}`;
    dialog.querySelectorAll('[data-close]').forEach(button => { button.disabled = false; });
    dialog.querySelector('.upload-actions [data-close]').textContent = 'Cerrar';
    // Keep results visible; closing refreshes the document list without resending successes.
  });
  document.body.append(dialog);
  dialog.showModal();
}
