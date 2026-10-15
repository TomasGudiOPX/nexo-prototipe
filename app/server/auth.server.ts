import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { withDatabase } from "./database.server";
import { serverConfigValue } from "./config.server";

export const NEXO_ROLES = ["site-admin", "knowledge-manager", "user", "auditor"] as const;
export type NexoRole = (typeof NEXO_ROLES)[number];

// Organisational label only: it never grants or removes access.
export const NEXO_AREAS = ["gerencia", "recursos-humanos", "comercial", "operaciones", "tecnica", "administracion", "legal", "sistemas", "calidad", "otro"] as const;
export type NexoArea = (typeof NEXO_AREAS)[number] | "";

export type NexoUser = { id: string; email: string; displayName: string; role: NexoRole; area: NexoArea; active: boolean };

// Permission helpers keep the role rules in one place instead of scattering
// literal role comparisons across the routes.
export const canManageSite = (user: NexoUser) => user.role === "site-admin";
export const canManageKnowledge = (user: NexoUser) => user.role === "site-admin" || user.role === "knowledge-manager";
// An auditor reads everything they are granted and changes nothing.
export const canMutate = (user: NexoUser) => user.role !== "auditor";

export const isNexoRole = (value: unknown): value is NexoRole => typeof value === "string" && (NEXO_ROLES as readonly string[]).includes(value);
export const toNexoArea = (value: unknown): NexoArea => (typeof value === "string" && (NEXO_AREAS as readonly string[]).includes(value) ? value as NexoArea : "");

const SESSION_COOKIE = "nexo_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

function sessionSecret() {
  const secret = serverConfigValue("NEXO_SESSION_SECRET");
  return secret && Buffer.byteLength(secret) >= 32 && !secret.toLowerCase().includes("replace-with") ? secret : null;
}

function passwordHash(password: string) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function verifyPassword(password: string, encoded: string) {
  const [algorithm, saltHex, hashHex] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function bootstrap(db: DatabaseSync) {
  const existing = db.prepare("SELECT id FROM users WHERE active=1 AND role='site-admin' LIMIT 1").get();
  if (existing) return;
  const count = Number((db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number }).count);
  if (count > 0) return;
  const email = serverConfigValue("NEXO_BOOTSTRAP_ADMIN_EMAIL")?.trim().toLowerCase();
  const displayName = serverConfigValue("NEXO_BOOTSTRAP_ADMIN_NAME")?.trim();
  const password = serverConfigValue("NEXO_BOOTSTRAP_ADMIN_PASSWORD");
  if (!email || !displayName || !password) {
    throw new Error("Configure NEXO_BOOTSTRAP_ADMIN_EMAIL, NEXO_BOOTSTRAP_ADMIN_NAME, and NEXO_BOOTSTRAP_ADMIN_PASSWORD before first sign-in.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 256 || password.toLowerCase().includes("replace-with") || displayName.length > 100) {
    throw new Error("NEXO bootstrap admin settings are invalid; use a valid email, name, and password of at least 12 characters.");
  }
  db.prepare("INSERT INTO users(id,email,display_name,password_hash,role) VALUES(?,?,?,?, 'site-admin')")
    .run(randomBytes(16).toString("hex"), email, displayName, passwordHash(password));
}

export function ensureBootstrapAdmin() {
  withDatabase(db => bootstrap(db));
}

function toUser(row: Record<string, unknown> | undefined): NexoUser | null {
  if (!row) return null;
  return { id: String(row.id), email: String(row.email), displayName: String(row.display_name), role: row.role as NexoRole, area: toNexoArea(row.area), active: Boolean(row.active) };
}

export function authenticate(email: string, password: string) {
  return withDatabase(db => {
    bootstrap(db);
    const row = db.prepare("SELECT * FROM users WHERE email=? COLLATE NOCASE").get(email.trim()) as Record<string, unknown> | undefined;
    const ok = row ? verifyPassword(password, String(row.password_hash)) : verifyPassword(password, "scrypt$00000000000000000000000000000000$" + "00".repeat(64));
    return row && ok && Boolean(row.active) ? toUser(row) : null;
  });
}

function sessionDigest(token: string) {
  const secret = sessionSecret();
  if (!secret) throw new Error("NEXO_SESSION_SECRET must contain at least 32 bytes.");
  return createHmac("sha256", secret).update(token).digest("hex");
}

function secureCookie(request: Request) {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

export function createSession(user: NexoUser, request: Request) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  withDatabase(db => {
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString());
    db.prepare("INSERT INTO sessions(id_hash,user_id,expires_at) VALUES(?,?,?)").run(sessionDigest(token), user.id, expires);
  });
  const flags = `Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}${secureCookie(request) ? "; Secure" : ""}`;
  return { token, cookie: `${SESSION_COOKIE}=${token}; ${flags}` };
}

function cookieValue(request: Request) {
  const cookies = request.headers.get("cookie") ?? "";
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ?? null;
}

export function currentUser(request: Request) {
  const token = cookieValue(request);
  if (!token) return null;
  let digest: string;
  try { digest = sessionDigest(token); } catch { return null; }
  return withDatabase(db => {
    const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id_hash=? AND s.expires_at>? AND u.active=1`).get(digest, new Date().toISOString()) as Record<string, unknown> | undefined;
    return toUser(row);
  });
}

export function destroySession(request: Request) {
  const token = cookieValue(request);
  if (token) {
    try { withDatabase(db => db.prepare("DELETE FROM sessions WHERE id_hash=?").run(sessionDigest(token))); } catch { /* missing server secret already invalidates every session */ }
  }
  const expired = `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureCookie(request) ? "; Secure" : ""}`;
  return expired;
}

export function requireSiteAdmin(request: Request) {
  const user = currentUser(request);
  if (!user) return { user: null, response: Response.json({ error: "Autenticación requerida." }, { status: 401, headers: { "Cache-Control": "no-store" } }) };
  if (!canManageSite(user)) return { user: null, response: Response.json({ error: "Acceso denegado." }, { status: 403, headers: { "Cache-Control": "no-store" } }) };
  return { user, response: null };
}

// Knowledge operations (datasets, documents) are shared by site admins and
// knowledge managers; the routes still scope them to reachable workspaces.
export function requireKnowledgeManager(request: Request) {
  const user = currentUser(request);
  if (!user) return { user: null, response: Response.json({ error: "Autenticación requerida." }, { status: 401, headers: { "Cache-Control": "no-store" } }) };
  if (!canManageKnowledge(user)) return { user: null, response: Response.json({ error: "Acceso denegado." }, { status: 403, headers: { "Cache-Control": "no-store" } }) };
  return { user, response: null };
}

export function requireUser(request: Request) {
  const user = currentUser(request);
  if (!user) return { user: null, response: Response.json({ error: "Iniciá sesión para continuar." }, { status: 401, headers: { "Cache-Control": "no-store" } }) };
  return { user, response: null };
}

export function validateMutationOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const requestUrl = new URL(request.url);
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
    const protocol = forwardedProtocol && ["http", "https"].includes(forwardedProtocol) ? forwardedProtocol : requestUrl.protocol.slice(0, -1);
    const host = forwardedHost || request.headers.get("host") || requestUrl.host;
    return new URL(origin).origin === new URL(`${protocol}://${host}`).origin;
  } catch { return false; }
}

export function listUsers() {
  return withDatabase(db => (db.prepare("SELECT id,email,display_name,role,area,active,created_at FROM users ORDER BY created_at").all() as Record<string, unknown>[]).map(row => ({ id: String(row.id), email: String(row.email), displayName: String(row.display_name), role: String(row.role), area: String(row.area ?? ""), active: Boolean(row.active), createdAt: String(row.created_at) })));
}

export function createUser(input: { email: string; displayName: string; password: string; role: NexoRole; area?: NexoArea }) {
  const email = input.email.trim().toLowerCase();
  const name = input.displayName.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 100 || input.password.length < 12 || input.password.length > 256 || !isNexoRole(input.role)) {
    throw new Error("Ingresá email válido, nombre, contraseña de al menos 12 caracteres y un rol permitido.");
  }
  const area = toNexoArea(input.area);
  return withDatabase(db => {
    const id = randomBytes(16).toString("hex");
    db.prepare("INSERT INTO users(id,email,display_name,password_hash,role,area) VALUES(?,?,?,?,?,?)").run(id, email, name, passwordHash(input.password), input.role, area);
    return listUsers().find(user => user.id === id);
  });
}

export function updateUser(id: string, patch: { displayName?: string; role?: NexoRole; area?: NexoArea; active?: boolean; password?: string }) {
  return withDatabase(db => {
    const target = db.prepare("SELECT id,role,active FROM users WHERE id=?").get(id) as { id: string; role: string; active: number } | undefined;
    if (!target) return false;
    const nextRole = patch.role ?? target.role;
    const nextActive = patch.active ?? Boolean(target.active);
    if (target.role === "site-admin" && Boolean(target.active) && (nextRole !== "site-admin" || !nextActive)) {
      const admins = Number((db.prepare("SELECT COUNT(*) AS count FROM users WHERE active=1 AND role='site-admin'").get() as { count: number }).count);
      if (admins <= 1) throw new Error("No se puede quitar o desactivar al último administrador activo.");
    }
    if (![isNexoRole(nextRole), typeof nextActive === "boolean"].every(Boolean)) throw new Error("Rol o estado inválido.");
    if (patch.displayName !== undefined && (!patch.displayName.trim() || patch.displayName.trim().length > 100)) throw new Error("El nombre no es válido.");
    if (patch.password !== undefined && (patch.password.length < 12 || patch.password.length > 256)) throw new Error("La contraseña debe tener al menos 12 caracteres.");
    const nextArea = patch.area === undefined ? null : toNexoArea(patch.area);
    db.prepare("UPDATE users SET display_name=COALESCE(?,display_name), role=?, area=COALESCE(?,area), active=?, password_hash=COALESCE(?,password_hash), updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(patch.displayName?.trim() ?? null, nextRole, nextArea, nextActive ? 1 : 0, patch.password ? passwordHash(patch.password) : null, id);
    if (!nextActive || patch.password !== undefined) db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
    return true;
  });
}
