CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`area` text NOT NULL,
	`project` text NOT NULL,
	`title` text NOT NULL,
	`owner` text NOT NULL,
	`due_date` text,
	`status` text DEFAULT 'De făcut' NOT NULL,
	`priority` text DEFAULT 'Medie' NOT NULL,
	`next_step` text DEFAULT '' NOT NULL,
	`link` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
