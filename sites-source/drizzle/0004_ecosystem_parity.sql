CREATE TABLE `ecosystem_pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`area` text NOT NULL,
	`title` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `licitatii_records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`tender_id` integer,
	`data` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_licitatii_records_kind_archived_updated` ON `licitatii_records` (`kind`,`archived`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_licitatii_records_kind_tender` ON `licitatii_records` (`kind`,`tender_id`);--> statement-breakpoint
CREATE TABLE `organization_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`before_document` text NOT NULL,
	`after_revision` integer NOT NULL,
	`before_tasks` text NOT NULL,
	`after_tasks` text NOT NULL,
	`undone` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `organization_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`document` text NOT NULL,
	`last_change_id` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` integer NOT NULL,
	`name` text NOT NULL,
	`size` integer NOT NULL,
	`mime` text NOT NULL,
	`object_key` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tenders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`authority` text DEFAULT '' NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`owner` text NOT NULL,
	`deadline` text,
	`status` text DEFAULT 'Analiză' NOT NULL,
	`next_action` text DEFAULT '' NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `tender_id` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `parent_id` integer;