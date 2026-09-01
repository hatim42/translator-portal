import { env } from "cloudflare:workers";
import { translatorSeeds } from "./seed-data";

export type PortalIdentity = {
  userId: string;
  email: string;
  displayName: string;
  e2eUsername: string | null;
};

export type PortalSession = {
  identity: PortalIdentity;
  role: "owner" | "translator" | "pending";
  translatorId: number | null;
};

type AppUserRow = {
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  translator_id: number | null;
};

type SessionUserRow = AppUserRow & {
  token_hash: string;
  expires_at: string;
};

export const SESSION_COOKIE_NAME = "__Host-translator_portal_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 8;

const SHIFTS = ["الوردية الأولى · 5 م - 11 م", "الوردية الثانية · 9 م - 3 ص", "وردية مرنة حسب الاحتياج"] as const;
const REST_DAYS = ["الجمعة", "السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"] as const;
const DEFAULT_SHIFTS = SHIFTS.slice(0, 2);
const DEFAULT_REST_DAYS = REST_DAYS.slice(0, 3);

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS translators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    group_name TEXT NOT NULL,
    language_group TEXT NOT NULL,
    primary_language TEXT NOT NULL,
    shift TEXT NOT NULL,
    rest_day TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS app_users (
    user_id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL,
    translator_id INTEGER UNIQUE REFERENCES translators(id),
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS portal_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES app_users(user_id),
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS translator_credentials (
    translator_id INTEGER PRIMARY KEY REFERENCES translators(id),
    code_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    key_hash TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    window_started_at TEXT NOT NULL,
    last_attempt_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS invite_codes (
    translator_id INTEGER PRIMARY KEY REFERENCES translators(id),
    code_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    used_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    translator_id INTEGER NOT NULL REFERENCES translators(id),
    cycle TEXT NOT NULL,
    preferred_shift TEXT NOT NULL,
    preferred_rest TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    submitted_at TEXT NOT NULL,
    UNIQUE(translator_id, cycle)
  )`,
  `CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    translator_id INTEGER NOT NULL REFERENCES translators(id),
    type TEXT NOT NULL,
    start_date TEXT,
    end_date TEXT,
    requested_value TEXT,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    owner_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    decided_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    translator_id INTEGER NOT NULL REFERENCES translators(id),
    kind TEXT NOT NULL,
    occurred_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS daily_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    translator_id INTEGER NOT NULL REFERENCES translators(id),
    work_date TEXT NOT NULL,
    beneficiaries INTEGER NOT NULL,
    sessions INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE(translator_id, work_date)
  )`,
  `CREATE TABLE IF NOT EXISTS rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    translator_id INTEGER NOT NULL REFERENCES translators(id),
    cycle TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    updated_at TEXT NOT NULL,
    UNIQUE(translator_id, cycle)
  )`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_translators_language_group ON translators(language_group)`,
  `CREATE INDEX IF NOT EXISTS idx_translators_group_name ON translators(group_name)`,
  `CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role)`,
  `CREATE INDEX IF NOT EXISTS idx_portal_sessions_user ON portal_sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_portal_sessions_expiry ON portal_sessions(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_preferences_cycle ON preferences(cycle)`,
  `CREATE INDEX IF NOT EXISTS idx_requests_status_created ON requests(status, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_requests_translator_created ON requests(translator_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_attendance_translator_time ON attendance(translator_id, occurred_at)`,
  `CREATE INDEX IF NOT EXISTS idx_daily_stats_work_date ON daily_stats(work_date)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at)`,
];

export function getPortalDb(): D1Database {
  if (!env.DB) throw new Error("قاعدة البيانات غير متاحة حالياً");
  return env.DB;
}

export async function ensurePortalDb(db: D1Database) {
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
  const row = await db.prepare("SELECT COUNT(*) AS count FROM translators").first<{ count: number }>();
  if (Number(row?.count ?? 0) === translatorSeeds.length) return;

  await db.batch(translatorSeeds.map((person, index) => db.prepare(
    `INSERT OR IGNORE INTO translators
      (username, name, group_name, language_group, primary_language, shift, rest_day, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
  ).bind(
    person.username,
    person.name,
    person.group,
    person.languageGroup,
    person.primaryLanguage,
    DEFAULT_SHIFTS[index % DEFAULT_SHIFTS.length],
    DEFAULT_REST_DAYS[index % DEFAULT_REST_DAYS.length],
  )));
}

export function identityFromRequest(request: Request): PortalIdentity | null {
  const url = new URL(request.url);
  const localHost = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "terminal.local";
  const e2eUsername = localHost ? request.headers.get("x-e2e-user") : null;
  if (e2eUsername) {
    return {
      userId: `e2e:${e2eUsername}`,
      email: `${e2eUsername}@e2e.local`,
      displayName: e2eUsername === "owner" ? "المشرف" : e2eUsername,
      e2eUsername,
    };
  }

  const userId = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email");
  if (!userId || !email) return null;

  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  let displayName = email;
  if (encodedName && request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    try { displayName = decodeURIComponent(encodedName); } catch { displayName = email; }
  }
  return { userId, email, displayName, e2eUsername: null };
}

export async function resolveRequestSession(
  db: D1Database,
  request: Request,
): Promise<PortalSession | null> {
  const externalIdentity = identityFromRequest(request);
  if (externalIdentity) return resolvePortalSession(db, externalIdentity);

  const token = readCookie(request, SESSION_COOKIE_NAME);
  if (!token) return null;

  const now = new Date().toISOString();
  const tokenHash = await hashValue(token);
  const row = await db.prepare(
    `SELECT s.token_hash, s.expires_at,
      u.user_id, u.email, u.display_name, u.role, u.translator_id
     FROM portal_sessions s
     JOIN app_users u ON u.user_id = s.user_id
     WHERE s.token_hash = ?`,
  ).bind(tokenHash).first<SessionUserRow>();

  if (!row || row.expires_at <= now) {
    await db.prepare("DELETE FROM portal_sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }

  const role = row.role === "owner" ? "owner" : "translator";
  if (role === "translator" && !row.translator_id) return null;
  await db.batch([
    db.prepare("UPDATE portal_sessions SET last_seen_at = ? WHERE token_hash = ?").bind(now, tokenHash),
    db.prepare("UPDATE app_users SET last_seen_at = ? WHERE user_id = ?").bind(now, row.user_id),
  ]);

  return {
    identity: {
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      e2eUsername: null,
    },
    role,
    translatorId: row.translator_id,
  };
}

export async function loginPortalUser(
  db: D1Database,
  request: Request,
  input: { mode: string; username?: string; accessCode?: string },
) {
  const mode = input.mode === "owner" ? "owner" : "translator";
  const username = cleanText(input.username ?? "", 80).toLowerCase();
  const accessCode = normalizeAccessCode(input.accessCode ?? "");
  const attemptKey = await loginAttemptKey(request, mode, username);
  await assertLoginAllowed(db, attemptKey);

  try {
    const user = mode === "owner"
      ? await authenticateOwner(db, accessCode)
      : await authenticateTranslator(db, username, accessCode);
    await db.prepare("DELETE FROM login_attempts WHERE key_hash = ?").bind(attemptKey).run();
    return createPortalSession(db, user);
  } catch (error) {
    await recordFailedLogin(db, attemptKey);
    throw error;
  }
}

export async function destroyPortalSession(db: D1Database, request: Request) {
  const token = readCookie(request, SESSION_COOKIE_NAME);
  if (!token) return;
  await db.prepare("DELETE FROM portal_sessions WHERE token_hash = ?")
    .bind(await hashValue(token)).run();
}

export function sessionCookie(token: string) {
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

export function expiredSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function resolvePortalSession(db: D1Database, identity: PortalIdentity): Promise<PortalSession> {
  const now = new Date().toISOString();
  if (identity.e2eUsername) {
    if (identity.e2eUsername === "owner") {
      await upsertAppUser(db, identity, "owner", null, now);
    } else {
      const translator = await db.prepare("SELECT id, name FROM translators WHERE username = ? AND active = 1")
        .bind(identity.e2eUsername).first<{ id: number; name: string }>();
      if (!translator) return { identity, role: "pending", translatorId: null };
      await upsertAppUser(db, { ...identity, displayName: translator.name }, "translator", translator.id, now);
    }
  }

  let user = await db.prepare("SELECT * FROM app_users WHERE user_id = ?")
    .bind(identity.userId).first<AppUserRow>();
  if (!user && !identity.e2eUsername) {
    const owners = await db.prepare("SELECT COUNT(*) AS count FROM app_users WHERE role = 'owner'")
      .first<{ count: number }>();
    if (Number(owners?.count ?? 0) === 0) {
      await upsertAppUser(db, identity, "owner", null, now);
      user = await db.prepare("SELECT * FROM app_users WHERE user_id = ?")
        .bind(identity.userId).first<AppUserRow>();
    }
  }

  if (!user) return { identity, role: "pending", translatorId: null };
  await db.prepare("UPDATE app_users SET last_seen_at = ?, email = ?, display_name = ? WHERE user_id = ?")
    .bind(now, identity.email, identity.displayName, identity.userId).run();
  return {
    identity,
    role: user.role === "owner" ? "owner" : "translator",
    translatorId: user.translator_id,
  };
}

async function upsertAppUser(
  db: D1Database,
  identity: PortalIdentity,
  role: "owner" | "translator",
  translatorId: number | null,
  now: string,
) {
  await db.prepare(
    `INSERT INTO app_users (user_id, email, display_name, role, translator_id, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       email = excluded.email,
       display_name = excluded.display_name,
       role = excluded.role,
       translator_id = excluded.translator_id,
       last_seen_at = excluded.last_seen_at`,
  ).bind(identity.userId, identity.email, identity.displayName, role, translatorId, now, now).run();
}

async function authenticateOwner(db: D1Database, accessCode: string): Promise<AppUserRow> {
  const configuredCode = normalizeAccessCode(env.OWNER_ACCESS_CODE ?? "");
  if (configuredCode.length < 10) throw new Error("لم يكتمل إعداد دخول المشرف");
  if (!await secretsEqual(accessCode, configuredCode)) {
    throw new Error("بيانات الدخول غير صحيحة");
  }

  const now = new Date().toISOString();
  const identity: PortalIdentity = {
    userId: "portal:owner",
    email: "owner@translator-portal.local",
    displayName: "المشرف",
    e2eUsername: null,
  };
  await upsertAppUser(db, identity, "owner", null, now);
  const user = await db.prepare("SELECT * FROM app_users WHERE user_id = ?")
    .bind(identity.userId).first<AppUserRow>();
  if (!user) throw new Error("تعذر تجهيز حساب المشرف");
  return user;
}

async function authenticateTranslator(
  db: D1Database,
  username: string,
  accessCode: string,
): Promise<AppUserRow> {
  if (!username || !accessCode) throw new Error("بيانات الدخول غير صحيحة");
  const translator = await db.prepare(
    `SELECT t.id, t.username, t.name,
      u.user_id, u.email, u.display_name, u.role, u.translator_id,
      c.code_hash AS credential_hash,
      i.code_hash AS invite_hash, i.used_at AS invite_used_at
     FROM translators t
     LEFT JOIN app_users u ON u.translator_id = t.id
     LEFT JOIN translator_credentials c ON c.translator_id = t.id
     LEFT JOIN invite_codes i ON i.translator_id = t.id
     WHERE lower(t.username) = lower(?) AND t.active = 1`,
  ).bind(username).first<{
    id: number;
    username: string;
    name: string;
    user_id: string | null;
    email: string | null;
    display_name: string | null;
    role: string | null;
    translator_id: number | null;
    credential_hash: string | null;
    invite_hash: string | null;
    invite_used_at: string | null;
  }>();

  const submittedHash = await hashCode(accessCode);
  const validCredential = translator?.credential_hash
    ? await secretsEqual(submittedHash, translator.credential_hash, false)
    : false;
  const validInvite = !translator?.credential_hash && translator?.invite_hash && !translator.invite_used_at
    ? await secretsEqual(submittedHash, translator.invite_hash, false)
    : false;
  if (!translator || (!validCredential && !validInvite)) {
    throw new Error("بيانات الدخول غير صحيحة");
  }

  const now = new Date().toISOString();
  const userId = translator.user_id ?? `portal:translator:${translator.id}`;
  const setupStatements: D1PreparedStatement[] = [];
  if (!translator.user_id) {
    setupStatements.push(db.prepare(
      `INSERT INTO app_users (user_id, email, display_name, role, translator_id, created_at, last_seen_at)
       VALUES (?, ?, ?, 'translator', ?, ?, ?)`,
    ).bind(
      userId,
      `${translator.username}@translator-portal.local`,
      translator.name,
      translator.id,
      now,
      now,
    ));
  }

  if (validInvite) {
    setupStatements.push(
      db.prepare(
        `INSERT INTO translator_credentials (translator_id, code_hash, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(translator_id) DO UPDATE SET code_hash = excluded.code_hash, updated_at = excluded.updated_at`,
      ).bind(translator.id, submittedHash, now),
      db.prepare("UPDATE invite_codes SET used_at = ? WHERE translator_id = ?").bind(now, translator.id),
    );
  }
  if (setupStatements.length) await db.batch(setupStatements);

  if (validInvite) {
    await writeAudit(db, userId, "claim_account", "translator", String(translator.id), translator.name);
  }

  const user = await db.prepare("SELECT * FROM app_users WHERE user_id = ?")
    .bind(userId).first<AppUserRow>();
  if (!user) throw new Error("تعذر تجهيز حساب المترجم");
  return user;
}

async function createPortalSession(db: D1Database, user: AppUserRow) {
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const expiresAt = new Date(nowDate.getTime() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  const token = randomHex(32);
  const tokenHash = await hashValue(token);
  await db.batch([
    db.prepare("DELETE FROM portal_sessions WHERE expires_at <= ?").bind(now),
    db.prepare(
      `INSERT INTO portal_sessions (token_hash, user_id, created_at, last_seen_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(tokenHash, user.user_id, now, now, expiresAt),
  ]);
  return { token, expiresAt };
}

async function loginAttemptKey(request: Request, mode: string, username: string) {
  const forwarded = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]
    ?? "unknown";
  return hashValue(`${forwarded.trim()}|${mode}|${username}`);
}

async function assertLoginAllowed(db: D1Database, keyHash: string) {
  const row = await db.prepare("SELECT attempts, window_started_at FROM login_attempts WHERE key_hash = ?")
    .bind(keyHash).first<{ attempts: number; window_started_at: string }>();
  if (!row) return;
  const windowAge = Date.now() - new Date(row.window_started_at).getTime();
  if (windowAge < LOGIN_WINDOW_MS && Number(row.attempts) >= MAX_LOGIN_ATTEMPTS) {
    throw new Error("محاولات دخول كثيرة. انتظر 15 دقيقة ثم حاول مجدداً");
  }
  if (windowAge >= LOGIN_WINDOW_MS) {
    await db.prepare("DELETE FROM login_attempts WHERE key_hash = ?").bind(keyHash).run();
  }
}

async function recordFailedLogin(db: D1Database, keyHash: string) {
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
  await db.prepare(
    `INSERT INTO login_attempts (key_hash, attempts, window_started_at, last_attempt_at)
     VALUES (?, 1, ?, ?)
     ON CONFLICT(key_hash) DO UPDATE SET
       attempts = CASE WHEN login_attempts.window_started_at <= ? THEN 1 ELSE login_attempts.attempts + 1 END,
       window_started_at = CASE WHEN login_attempts.window_started_at <= ? THEN excluded.window_started_at ELSE login_attempts.window_started_at END,
       last_attempt_at = excluded.last_attempt_at`,
  ).bind(keyHash, now, now, cutoff, cutoff).run();
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    if (entry.slice(0, separator).trim() === name) return entry.slice(separator + 1).trim();
  }
  return null;
}

function normalizeAccessCode(value: string) {
  return String(value).trim().toUpperCase();
}

async function secretsEqual(left: string, right: string, hashInputs = true) {
  const [leftDigest, rightDigest] = hashInputs
    ? await Promise.all([hashValue(left), hashValue(right)])
    : [left, right];
  if (leftDigest.length !== rightDigest.length) return false;
  let difference = 0;
  for (let index = 0; index < leftDigest.length; index += 1) {
    difference |= leftDigest.charCodeAt(index) ^ rightDigest.charCodeAt(index);
  }
  return difference === 0;
}

function randomHex(length: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function currentCycle() {
  const { year, month } = riyadhDateParts();
  return `${year}-${month}`;
}

export async function getOwnerPortal(db: D1Database, session: PortalSession) {
  const cycle = currentCycle();
  const [peopleResult, requestResult, auditResult] = await Promise.all([
    db.prepare(
      `SELECT t.*,
        CASE WHEN u.user_id IS NULL THEN 0 ELSE 1 END AS linked,
        p.preferred_shift, p.preferred_rest, p.note AS preference_note, p.submitted_at,
        COALESCE(rw.status, 'pending') AS reward_status
       FROM translators t
       LEFT JOIN app_users u ON u.translator_id = t.id
       LEFT JOIN preferences p ON p.translator_id = t.id AND p.cycle = ?
       LEFT JOIN rewards rw ON rw.translator_id = t.id AND rw.cycle = ?
       WHERE t.active = 1
       ORDER BY t.language_group, t.group_name, t.name`,
    ).bind(cycle, cycle).all(),
    db.prepare(
      `SELECT r.*, t.name, t.username, t.language_group
       FROM requests r JOIN translators t ON t.id = r.translator_id
       ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 250`,
    ).all(),
    db.prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 20").all(),
  ]);

  const people = peopleResult.results as Record<string, unknown>[];
  const requests = requestResult.results as Record<string, unknown>[];
  const submitted = people.filter((person) => Boolean(person.submitted_at)).length;
  const pending = requests.filter((request) => request.status === "pending").length;
  const linked = people.filter((person) => Number(person.linked) === 1).length;
  return {
    authenticated: true,
    role: "owner" as const,
    user: session.identity,
    cycle,
    metrics: { translators: people.length, submitted, pending, linked },
    people,
    requests,
    audit: auditResult.results,
  };
}

export async function getTranslatorPortal(db: D1Database, session: PortalSession) {
  if (!session.translatorId) throw new Error("حساب المترجم غير مربوط");
  const cycle = currentCycle();
  const [person, preference, requestResult, attendanceResult, statsResult, reward] = await Promise.all([
    db.prepare("SELECT * FROM translators WHERE id = ?").bind(session.translatorId).first(),
    db.prepare("SELECT * FROM preferences WHERE translator_id = ? AND cycle = ?")
      .bind(session.translatorId, cycle).first(),
    db.prepare("SELECT * FROM requests WHERE translator_id = ? ORDER BY created_at DESC LIMIT 30")
      .bind(session.translatorId).all(),
    db.prepare("SELECT * FROM attendance WHERE translator_id = ? ORDER BY occurred_at DESC LIMIT 12")
      .bind(session.translatorId).all(),
    db.prepare("SELECT * FROM daily_stats WHERE translator_id = ? ORDER BY work_date DESC LIMIT 14")
      .bind(session.translatorId).all(),
    db.prepare("SELECT * FROM rewards WHERE translator_id = ? AND cycle = ?")
      .bind(session.translatorId, cycle).first(),
  ]);
  return {
    authenticated: true,
    role: "translator" as const,
    user: session.identity,
    cycle,
    person,
    preference,
    requests: requestResult.results,
    attendance: attendanceResult.results,
    stats: statsResult.results,
    reward: reward ?? { status: "pending" },
  };
}

export async function claimTranslatorAccount(
  db: D1Database,
  session: PortalSession,
  username: string,
  code: string,
) {
  if (session.role !== "pending") throw new Error("الحساب مربوط بالفعل");
  const translator = await db.prepare(
    `SELECT t.id, t.name,
      CASE WHEN u.user_id IS NULL THEN 0 ELSE 1 END AS linked,
      i.code_hash, i.used_at
     FROM translators t
     LEFT JOIN app_users u ON u.translator_id = t.id
     LEFT JOIN invite_codes i ON i.translator_id = t.id
     WHERE lower(t.username) = lower(?) AND t.active = 1`,
  ).bind(username.trim()).first<{ id: number; name: string; linked: number; code_hash: string | null; used_at: string | null }>();
  if (!translator || translator.linked || !translator.code_hash || translator.used_at) {
    throw new Error("اسم المستخدم أو رمز الدعوة غير صحيح");
  }
  const submittedHash = await hashCode(code);
  if (!await secretsEqual(submittedHash, translator.code_hash, false)) {
    throw new Error("اسم المستخدم أو رمز الدعوة غير صحيح");
  }
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(
      `INSERT INTO app_users (user_id, email, display_name, role, translator_id, created_at, last_seen_at)
       VALUES (?, ?, ?, 'translator', ?, ?, ?)`,
    ).bind(session.identity.userId, session.identity.email, translator.name, translator.id, now, now),
    db.prepare(
      `INSERT INTO translator_credentials (translator_id, code_hash, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(translator_id) DO UPDATE SET code_hash = excluded.code_hash, updated_at = excluded.updated_at`,
    ).bind(translator.id, submittedHash, now),
    db.prepare("UPDATE invite_codes SET used_at = ? WHERE translator_id = ?").bind(now, translator.id),
  ]);
  await writeAudit(db, session.identity.userId, "claim_account", "translator", String(translator.id), translator.name);
}

export async function generateInviteCode(db: D1Database, session: PortalSession, translatorId: number) {
  requireOwner(session);
  if (!Number.isInteger(translatorId) || translatorId < 1) throw new Error("حساب المترجم غير صحيح");
  const translator = await db.prepare(
    `SELECT t.id, u.user_id
     FROM translators t LEFT JOIN app_users u ON u.translator_id = t.id
     WHERE t.id = ? AND t.active = 1`,
  ).bind(translatorId).first<{ id: number; user_id: string | null }>();
  if (!translator) throw new Error("حساب المترجم غير موجود");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const code = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  const now = new Date().toISOString();
  const statements = [
    db.prepare(
      `INSERT INTO invite_codes (translator_id, code_hash, created_at, used_at)
       VALUES (?, ?, ?, NULL)
       ON CONFLICT(translator_id) DO UPDATE SET code_hash = excluded.code_hash, created_at = excluded.created_at, used_at = NULL`,
    ).bind(translatorId, await hashCode(code), now),
    db.prepare("DELETE FROM translator_credentials WHERE translator_id = ?").bind(translatorId),
  ];
  if (translator.user_id) {
    statements.push(db.prepare("DELETE FROM portal_sessions WHERE user_id = ?").bind(translator.user_id));
  }
  await db.batch(statements);
  await writeAudit(db, session.identity.userId, "generate_invite", "translator", String(translatorId), "تم إنشاء رمز دعوة جديد");
  return code;
}

export async function savePreference(
  db: D1Database,
  session: PortalSession,
  preferredShift: string,
  preferredRest: string,
  note: string,
) {
  const translatorId = requireTranslator(session);
  const cycle = currentCycle();
  const now = new Date().toISOString();
  const shift = allowedChoice(preferredShift, SHIFTS, "الوردية المختارة غير صحيحة");
  const rest = allowedChoice(preferredRest, REST_DAYS, "يوم الراحة المختار غير صحيح");
  await db.prepare(
    `INSERT INTO preferences (translator_id, cycle, preferred_shift, preferred_rest, note, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(translator_id, cycle) DO UPDATE SET
       preferred_shift = excluded.preferred_shift,
       preferred_rest = excluded.preferred_rest,
       note = excluded.note,
       submitted_at = excluded.submitted_at`,
  ).bind(translatorId, cycle, shift, rest, cleanText(note, 400), now).run();
  await writeAudit(db, session.identity.userId, "submit_preference", "translator", String(translatorId), cycle);
}

export async function createPortalRequest(
  db: D1Database,
  session: PortalSession,
  input: { type: string; startDate?: string; endDate?: string; requestedValue?: string; reason?: string },
) {
  const translatorId = requireTranslator(session);
  if (!["leave", "shift", "rest"].includes(input.type)) throw new Error("نوع الطلب غير صحيح");
  const reason = cleanText(input.reason ?? "", 600);
  if (reason.length < 5) throw new Error("اكتب سبباً واضحاً للطلب");
  if (input.type === "leave" && (!isDate(input.startDate) || !isDate(input.endDate))) {
    throw new Error("حدد تاريخ بداية ونهاية الإجازة");
  }
  if (input.type === "leave" && input.startDate! > input.endDate!) {
    throw new Error("تاريخ نهاية الإجازة يجب ألا يسبق تاريخ البداية");
  }
  const requestedValue = input.type === "shift"
    ? allowedChoice(input.requestedValue ?? "", SHIFTS, "الوردية المطلوبة غير صحيحة")
    : input.type === "rest"
      ? allowedChoice(input.requestedValue ?? "", REST_DAYS, "يوم الراحة المطلوب غير صحيح")
      : null;
  const now = new Date().toISOString();
  const result = await db.prepare(
    `INSERT INTO requests
      (translator_id, type, start_date, end_date, requested_value, reason, status, owner_note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', '', ?)`,
  ).bind(
    translatorId,
    input.type,
    input.startDate ?? null,
    input.endDate ?? null,
    requestedValue,
    reason,
    now,
  ).run();
  await writeAudit(db, session.identity.userId, "create_request", "request", String(result.meta.last_row_id), input.type);
}

export async function decidePortalRequest(
  db: D1Database,
  session: PortalSession,
  requestId: number,
  status: string,
  ownerNote: string,
) {
  requireOwner(session);
  if (!Number.isInteger(requestId) || requestId < 1) throw new Error("رقم الطلب غير صحيح");
  if (!["approved", "rejected"].includes(status)) throw new Error("قرار الطلب غير صحيح");
  const request = await db.prepare("SELECT * FROM requests WHERE id = ? AND status = 'pending'")
    .bind(requestId).first<{ id: number; translator_id: number; type: string; requested_value: string | null }>();
  if (!request) throw new Error("الطلب غير موجود أو سبق اتخاذ قرار بشأنه");
  const now = new Date().toISOString();
  const statements = [db.prepare(
    "UPDATE requests SET status = ?, owner_note = ?, decided_at = ? WHERE id = ?",
  ).bind(status, cleanText(ownerNote, 500), now, requestId)];
  if (status === "approved" && request.type === "shift" && request.requested_value) {
    statements.push(db.prepare("UPDATE translators SET shift = ? WHERE id = ?").bind(request.requested_value, request.translator_id));
  }
  if (status === "approved" && request.type === "rest" && request.requested_value) {
    statements.push(db.prepare("UPDATE translators SET rest_day = ? WHERE id = ?").bind(request.requested_value, request.translator_id));
  }
  await db.batch(statements);
  await writeAudit(db, session.identity.userId, "decide_request", "request", String(requestId), status);
}

export async function saveDistribution(
  db: D1Database,
  session: PortalSession,
  assignments: Array<{ translatorId: number; shift: string; restDay: string }>,
) {
  requireOwner(session);
  const activeResult = await db.prepare("SELECT id FROM translators WHERE active = 1").all<{ id: number }>();
  const activeIds = new Set(activeResult.results.map((row) => Number(row.id)));
  const suppliedIds = new Set(assignments.map((item) => Number(item.translatorId)));
  if (assignments.length !== activeIds.size || suppliedIds.size !== activeIds.size) {
    throw new Error("بيانات التوزيع غير مكتملة");
  }
  const cleanAssignments = assignments.map((item) => {
    const translatorId = Number(item.translatorId);
    if (!Number.isInteger(translatorId) || !activeIds.has(translatorId)) throw new Error("بيانات المترجم في التوزيع غير صحيحة");
    return {
      translatorId,
      shift: allowedChoice(item.shift, SHIFTS, "إحدى الورديات المختارة غير صحيحة"),
      restDay: allowedChoice(item.restDay, REST_DAYS, "أحد أيام الراحة المختارة غير صحيح"),
    };
  });
  await db.batch(cleanAssignments.map((item) => db.prepare(
    "UPDATE translators SET shift = ?, rest_day = ? WHERE id = ? AND active = 1",
  ).bind(item.shift, item.restDay, item.translatorId)));
  await writeAudit(db, session.identity.userId, "save_distribution", "distribution", currentCycle(), `${assignments.length} مترجماً`);
}

export async function recordAttendance(db: D1Database, session: PortalSession, kind: string) {
  const translatorId = requireTranslator(session);
  if (!["in", "out"].includes(kind)) throw new Error("نوع التسجيل غير صحيح");
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO attendance (translator_id, kind, occurred_at) VALUES (?, ?, ?)")
    .bind(translatorId, kind, now).run();
  await writeAudit(db, session.identity.userId, "attendance", "translator", String(translatorId), kind);
}

export async function recordDailyStat(
  db: D1Database,
  session: PortalSession,
  workDate: string,
  beneficiaries: number,
  sessions: number,
  note: string,
) {
  const translatorId = requireTranslator(session);
  if (!isDate(workDate)) throw new Error("تاريخ الإحصاء غير صحيح");
  if (!Number.isInteger(beneficiaries) || beneficiaries < 0 || beneficiaries > 100000) throw new Error("عدد المستفيدين غير صحيح");
  if (!Number.isInteger(sessions) || sessions < 0 || sessions > 1000) throw new Error("عدد الجلسات غير صحيح");
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO daily_stats (translator_id, work_date, beneficiaries, sessions, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(translator_id, work_date) DO UPDATE SET
       beneficiaries = excluded.beneficiaries,
       sessions = excluded.sessions,
       note = excluded.note,
       created_at = excluded.created_at`,
  ).bind(translatorId, workDate, beneficiaries, sessions, cleanText(note, 500), now).run();
  await writeAudit(db, session.identity.userId, "daily_stat", "translator", String(translatorId), workDate);
}

export async function setRewardStatus(
  db: D1Database,
  session: PortalSession,
  translatorId: number,
  status: string,
) {
  requireOwner(session);
  if (!Number.isInteger(translatorId) || translatorId < 1) throw new Error("حساب المترجم غير صحيح");
  if (!["pending", "paid", "on_hold"].includes(status)) throw new Error("حالة المكافأة غير صحيحة");
  const cycle = currentCycle();
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO rewards (translator_id, cycle, status, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(translator_id, cycle) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
  ).bind(translatorId, cycle, status, now).run();
  await writeAudit(db, session.identity.userId, "set_reward", "translator", String(translatorId), status);
}

export async function resetE2eState(db: D1Database, session: PortalSession) {
  if (session.identity.e2eUsername !== "owner") throw new Error("غير مسموح");
  await db.batch([
    db.prepare("DELETE FROM portal_sessions"),
    db.prepare("DELETE FROM login_attempts"),
    db.prepare("DELETE FROM audit_log"),
    db.prepare("DELETE FROM rewards"),
    db.prepare("DELETE FROM daily_stats"),
    db.prepare("DELETE FROM attendance"),
    db.prepare("DELETE FROM requests"),
    db.prepare("DELETE FROM preferences"),
    db.prepare("DELETE FROM translator_credentials"),
    db.prepare("DELETE FROM invite_codes"),
    db.prepare("DELETE FROM app_users"),
  ]);
  await db.batch(translatorSeeds.map((person, index) => db.prepare(
    "UPDATE translators SET shift = ?, rest_day = ? WHERE username = ?",
  ).bind(DEFAULT_SHIFTS[index % DEFAULT_SHIFTS.length], DEFAULT_REST_DAYS[index % DEFAULT_REST_DAYS.length], person.username)));
}

function requireOwner(session: PortalSession) {
  if (session.role !== "owner") throw new Error("هذه العملية متاحة للمشرف فقط");
}

function requireTranslator(session: PortalSession) {
  if (session.role !== "translator" || !session.translatorId) throw new Error("هذه العملية متاحة للمترجم فقط");
  return session.translatorId;
}

async function writeAudit(
  db: D1Database,
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  detail: string,
) {
  await db.prepare(
    `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(actorUserId, action, entityType, entityId, cleanText(detail, 800), new Date().toISOString()).run();
}

async function hashCode(code: string) {
  return hashValue(normalizeAccessCode(code));
}

async function hashValue(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cleanText(value: string, maxLength: number) {
  return String(value).trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function allowedChoice(value: string, allowed: readonly string[], message: string) {
  const result = cleanText(value, 100);
  if (!allowed.includes(result)) throw new Error(message);
  return result;
}

function isDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function riyadhDateParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])) as {
    year: string;
    month: string;
    day: string;
  };
}
