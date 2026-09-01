import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const translators = sqliteTable("translators", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  name: text("name").notNull(),
  groupName: text("group_name").notNull(),
  languageGroup: text("language_group").notNull(),
  primaryLanguage: text("primary_language").notNull(),
  shift: text("shift").notNull(),
  restDay: text("rest_day").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
}, (table) => [
  index("idx_translators_language_group").on(table.languageGroup),
  index("idx_translators_group_name").on(table.groupName),
]);

export const appUsers = sqliteTable("app_users", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull(),
  translatorId: integer("translator_id").references(() => translators.id),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
}, (table) => [
  uniqueIndex("idx_app_users_translator_unique").on(table.translatorId),
  index("idx_app_users_role").on(table.role),
]);

export const portalSessions = sqliteTable("portal_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => appUsers.userId),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  expiresAt: text("expires_at").notNull(),
}, (table) => [
  index("idx_portal_sessions_user").on(table.userId),
  index("idx_portal_sessions_expiry").on(table.expiresAt),
]);

export const translatorCredentials = sqliteTable("translator_credentials", {
  translatorId: integer("translator_id").primaryKey().references(() => translators.id),
  codeHash: text("code_hash").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const loginAttempts = sqliteTable("login_attempts", {
  keyHash: text("key_hash").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  windowStartedAt: text("window_started_at").notNull(),
  lastAttemptAt: text("last_attempt_at").notNull(),
});

export const inviteCodes = sqliteTable("invite_codes", {
  translatorId: integer("translator_id").primaryKey().references(() => translators.id),
  codeHash: text("code_hash").notNull(),
  createdAt: text("created_at").notNull(),
  usedAt: text("used_at"),
});

export const preferences = sqliteTable("preferences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  translatorId: integer("translator_id").notNull().references(() => translators.id),
  cycle: text("cycle").notNull(),
  preferredShift: text("preferred_shift").notNull(),
  preferredRest: text("preferred_rest").notNull(),
  note: text("note").notNull().default(""),
  submittedAt: text("submitted_at").notNull(),
}, (table) => [
  uniqueIndex("idx_preferences_translator_cycle").on(table.translatorId, table.cycle),
  index("idx_preferences_cycle").on(table.cycle),
]);

export const requests = sqliteTable("requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  translatorId: integer("translator_id").notNull().references(() => translators.id),
  type: text("type").notNull(),
  startDate: text("start_date"),
  endDate: text("end_date"),
  requestedValue: text("requested_value"),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  ownerNote: text("owner_note").notNull().default(""),
  createdAt: text("created_at").notNull(),
  decidedAt: text("decided_at"),
}, (table) => [
  index("idx_requests_status_created").on(table.status, table.createdAt),
  index("idx_requests_translator_created").on(table.translatorId, table.createdAt),
]);

export const attendance = sqliteTable("attendance", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  translatorId: integer("translator_id").notNull().references(() => translators.id),
  kind: text("kind").notNull(),
  occurredAt: text("occurred_at").notNull(),
}, (table) => [
  index("idx_attendance_translator_time").on(table.translatorId, table.occurredAt),
]);

export const dailyStats = sqliteTable("daily_stats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  translatorId: integer("translator_id").notNull().references(() => translators.id),
  workDate: text("work_date").notNull(),
  beneficiaries: integer("beneficiaries").notNull(),
  sessions: integer("sessions").notNull(),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("idx_daily_stats_translator_date").on(table.translatorId, table.workDate),
  index("idx_daily_stats_work_date").on(table.workDate),
]);

export const rewards = sqliteTable("rewards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  translatorId: integer("translator_id").notNull().references(() => translators.id),
  cycle: text("cycle").notNull(),
  status: text("status").notNull().default("pending"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("idx_rewards_translator_cycle").on(table.translatorId, table.cycle),
]);

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorUserId: text("actor_user_id").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  detail: text("detail").notNull().default(""),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_audit_created_at").on(table.createdAt),
]);
