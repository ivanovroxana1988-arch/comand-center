import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }), area: text("area").notNull(),
  tenderId: integer("tender_id"), parentId: integer("parent_id"),
  project: text("project").notNull(), title: text("title").notNull(), owner: text("owner").notNull(),
  dueDate: text("due_date"), status: text("status").notNull().default("De făcut"),
  priority: text("priority").notNull().default("Medie"), nextStep: text("next_step").notNull().default(""),
  link: text("link").notNull().default(""), notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
  parentTaskId: integer("parent_task_id"),
});
export const taskChanges = sqliteTable("task_changes", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(),
  operation: text("operation").notNull(), taskId: integer("task_id"),
  payload: text("payload").notNull(), beforeJson: text("before_json").notNull(),
  expiresAt: text("expires_at").notNull(), status: text("status").notNull(),
  attempt: text("attempt"), resultJson: text("result_json"), createdAt: text("created_at").notNull(),
});
export type Task = typeof tasks.$inferSelect;

export const tenders = sqliteTable("tenders", {
  id: integer("id").primaryKey({ autoIncrement: true }), title: text("title").notNull(),
  authority: text("authority").notNull().default(""), reference: text("reference").notNull().default(""),
  owner: text("owner").notNull(), deadline: text("deadline"), status: text("status").notNull().default("Analiză"),
  nextAction: text("next_action").notNull().default(""), sourceUrl: text("source_url").notNull().default(""),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
});
export type Tender = typeof tenders.$inferSelect;

export const licitatiiRecords = sqliteTable("licitatii_records", {
  id: text("id").primaryKey(), kind: text("kind").notNull(),
  tenderId: integer("tender_id"), data: text("data").notNull(),
  version: integer("version").notNull().default(1),
  archived: integer("archived").notNull().default(0),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_licitatii_records_kind_archived_updated").on(table.kind, table.archived, table.updatedAt),
  index("idx_licitatii_records_kind_tender").on(table.kind, table.tenderId),
]);

export const ecosystemPages = sqliteTable("ecosystem_pages", {
 id: integer("id").primaryKey({ autoIncrement: true }),
 area: text("area").notNull(), title: text("title").notNull(), createdAt: text("created_at").notNull(),
}, table => [uniqueIndex("ecosystem_pages_area_title").on(table.area,table.title)]);

export const organizationState = sqliteTable("organization_state", {
 id: integer("id").primaryKey(), revision: integer("revision").notNull().default(0),
 document: text("document").notNull(), lastChangeId: text("last_change_id"), updatedAt: text("updated_at").notNull(),
});
export const organizationChanges = sqliteTable("organization_changes", {
 id: text("id").primaryKey(), beforeDocument: text("before_document").notNull(),
 afterRevision: integer("after_revision").notNull(), beforeTasks: text("before_tasks").notNull(),
 afterTasks: text("after_tasks").notNull(), undone: integer("undone").notNull().default(0), createdAt: text("created_at").notNull(),
});
export const taskAttachments = sqliteTable("task_attachments", {
 id: text("id").primaryKey(), taskId: integer("task_id").notNull(), name: text("name").notNull(),
 size: integer("size").notNull(), mime: text("mime").notNull(), objectKey: text("object_key").notNull(),
 createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull(),
});

export const authLoginStates = sqliteTable('auth_login_states', {
  stateHash: text('state_hash').primaryKey(), browserHash: text('browser_hash').notNull(),
  verifier: text('verifier').notNull(), nonce: text('nonce').notNull(), expiresAt: integer('expires_at').notNull(),
  returnTo: text('return_to').notNull().default('/'),
});
export const authSessions = sqliteTable('auth_sessions', {
  tokenHash: text('token_hash').primaryKey(), userId: text('user_id').notNull(),
  email: text('email').notNull(), expiresAt: integer('expires_at').notNull(),
});
export const mcpOauthGrants = sqliteTable('mcp_oauth_grants', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), clientId: text('client_id').notNull(),
  resource: text('resource').notNull(), scope: text('scope').notNull(),
  expiresAt: integer('expires_at').notNull(), revoked: integer('revoked').notNull().default(0),
});
export const mcpOauthSecrets = sqliteTable('mcp_oauth_secrets', {
  hash: text('hash').primaryKey(), kind: text('kind').notNull(), payload: text('payload').notNull(),
  grantId: text('grant_id'), expiresAt: integer('expires_at').notNull(), used: integer('used').notNull().default(0),
});
