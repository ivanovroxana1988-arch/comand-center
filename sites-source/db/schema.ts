import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }), area: text("area").notNull(),
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
