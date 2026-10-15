const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

function fieldMarkup(field, esc) {
  const label = esc(field.label);
  const name = esc(field.name);
  const required = field.required ? " required" : "";
  const placeholder = field.placeholder ? ` placeholder="${esc(field.placeholder)}"` : "";
  const maxlength = field.maxlength ?? 500;
  if (field.type === "textarea") return `<label><span>${label}</span><textarea name="${name}" maxlength="${maxlength}"${placeholder}${required}></textarea></label>`;
  if (field.type === "select") {
    const options = (field.options || []).map(option => `<option value="${esc(option.value)}"${option.selected ? " selected" : ""}>${esc(option.label)}</option>`).join("");
    return `<label><span>${label}</span><select name="${name}"${required}>${options}</select></label>`;
  }
  if (field.type === "checkboxes") {
    const options = (field.options || []).map(option => `
      <label class="modal-check">
        <input type="checkbox" name="${name}" value="${esc(option.value)}"${option.checked ? " checked" : ""}>
        <span>${esc(option.label)}</span>
        ${option.hint ? `<small>${esc(option.hint)}</small>` : ""}
      </label>`).join("");
    return `<fieldset class="modal-fieldset">
      <legend>${label}</legend>
      ${options || `<p class="modal-status">${esc(field.empty || "No hay opciones disponibles.")}</p>`}
    </fieldset>`;
  }
  return `<label><span>${label}</span><input type="${esc(field.type || "text")}" name="${name}" maxlength="${maxlength}"${placeholder}${required}></label>`;
}

/**
 * Lightweight form modal shared by workspace actions (create workspace,
 * create dataset, create/share assistant). The caller owns the request logic,
 * so this module stays free of API concerns: onSubmit resolves on success and
 * throws on failure. onSubmit also receives the FormData, which is what
 * multi-value fields such as a checkbox list need.
 */
export function openFormModal({ title, description = "", fields, submitLabel, onSubmit, esc = escapeHtml }) {
  const dialog = document.createElement("dialog");
  dialog.className = "nexo-modal";
  dialog.setAttribute("aria-labelledby", "nexoModalTitle");
  dialog.innerHTML = `
    <header class="modal-heading">
      <h2 id="nexoModalTitle">${esc(title)}</h2>
      <button type="button" class="secondary" data-close aria-label="Cerrar">×</button>
    </header>
    ${description ? `<p class="modal-description">${esc(description)}</p>` : ""}
    <form>
      ${fields.map(field => fieldMarkup(field, esc)).join("")}
      <p class="modal-status" data-status role="status"></p>
      <div class="modal-actions">
        <button type="button" class="secondary" data-close>Cancelar</button>
        <button type="submit">${esc(submitLabel)}</button>
      </div>
    </form>`;
  const form = dialog.querySelector("form");
  const status = dialog.querySelector("[data-status]");
  const submit = dialog.querySelector("button[type=submit]");
  const close = () => dialog.close();
  dialog.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", close));
  dialog.addEventListener("click", event => { if (event.target === dialog) close(); });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    status.classList.remove("error");
    status.textContent = "Guardando…";
    try {
      const formData = new FormData(form);
      await onSubmit(Object.fromEntries(formData.entries()), formData);
      dialog.close();
    } catch (error) {
      status.textContent = error?.message || "No se pudo completar la operación.";
      status.classList.add("error");
      submit.disabled = false;
    }
  });
  document.body.append(dialog);
  dialog.showModal();
  dialog.querySelector("input, textarea")?.focus();
}
