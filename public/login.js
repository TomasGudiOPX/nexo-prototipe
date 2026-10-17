// Pantalla de inicio de sesión de NEXO.
// Se usa de dos maneras:
//   1. Como página propia (/login.html): valida credenciales contra /api/auth/login.
//   2. Como gate del shell principal: al importarse desde /nexo-prototipo.html exige
//      una sesión válida antes de revelar la aplicación.

export const LOGIN_PATH = "/login.html";
export const SHELL_PATH = "/nexo-prototipo.html";

// Sólo se acepta volver al propio shell: descarta destinos externos o malformados.
export function safeReturn(candidate) {
  try {
    const url = new URL(candidate || "", location.origin);
    if (url.origin !== location.origin || url.pathname !== SHELL_PATH) return SHELL_PATH;
    return url.pathname + url.search;
  } catch {
    return SHELL_PATH;
  }
}

export const loginUrl = (returnTo = location.href) => `${LOGIN_PATH}?returnTo=${encodeURIComponent(safeReturn(returnTo))}`;

export function goToLogin(returnTo = location.href) {
  location.replace(loginUrl(returnTo));
}

export async function fetchSession() {
  const response = await fetch("/api/auth/session", { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error("No se pudo verificar la sesión con el servidor.");
  const payload = await response.json().catch(() => ({}));
  return payload.user || null;
}

// Puente para los scripts clásicos del shell (nexo-ragflow.js, shell-controls.js),
// que no pueden importar módulos pero sí necesitan salir hacia la pantalla de ingreso.
window.nexoAuth = { loginUrl, goToLogin, safeReturn, fetchSession };

function showError(element, message) {
  if (!element.textContent) element.textContent = message;
}

async function initLoginPage(returnTo) {
  const form = document.getElementById("loginForm");
  const email = document.getElementById("loginEmail");
  const password = document.getElementById("loginPassword");
  const error = document.getElementById("loginError");
  const submit = document.getElementById("loginSubmit");

  // Una sesión vigente no necesita volver a autenticarse.
  fetchSession()
    .then(user => { if (user) location.replace(returnTo); })
    .catch(err => showError(error, err.message));

  form.addEventListener("submit", async event => {
    event.preventDefault();
    error.textContent = "";
    submit.disabled = true;
    submit.textContent = "Entrando…";
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: email.value.trim(), password: password.value }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `No se pudo iniciar sesión (${response.status}).`);
      location.replace(returnTo);
    } catch (err) {
      error.textContent = err instanceof Error ? err.message : "No se pudo iniciar sesión.";
      submit.disabled = false;
      submit.textContent = "Entrar";
      password.value = "";
      password.focus();
    }
  });
}

async function initGate() {
  const returnTo = location.pathname + location.search;
  try {
    const user = await fetchSession();
    // Sin sesión válida el shell nunca se muestra: se vuelve a la pantalla de ingreso.
    if (!user) { goToLogin(returnTo); return; }
    document.documentElement.classList.add("nexo-authed");
  } catch {
    // El servidor no confirma la sesión; el error se explica en la pantalla de ingreso.
    goToLogin(returnTo);
  }
}

if (document.getElementById("loginForm")) initLoginPage(safeReturn(new URLSearchParams(location.search).get("returnTo")));
else if (document.getElementById("nexoGate")) void initGate();
