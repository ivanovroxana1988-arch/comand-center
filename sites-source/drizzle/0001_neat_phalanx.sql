CREATE TABLE `task_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`operation` text NOT NULL,
	`task_id` integer,
	`payload` text NOT NULL,
	`before_json` text NOT NULL,
	`expires_at` text NOT NULL,
	`status` text NOT NULL,
	`attempt` text,
	`result_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `parent_task_id` integer;