CREATE TABLE `notification_config` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`event_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer NOT NULL,
	`next_attempt` integer NOT NULL,
	PRIMARY KEY(`event_id`, `subscription_id`)
);
--> statement-breakpoint
CREATE TABLE `notification_events` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` integer,
	`owner` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`owner` text NOT NULL,
	`endpoint` text NOT NULL,
	`time_zone` text NOT NULL,
	`created_at` text NOT NULL
);

--> statement-breakpoint
CREATE TRIGGER notification_task_created AFTER INSERT ON tasks BEGIN INSERT INTO notification_events(id,task_id,owner,kind,created_at) VALUES(lower(hex(randomblob(16))),NEW.id,NEW.owner,'created',strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
--> statement-breakpoint
CREATE TRIGGER notification_task_updated AFTER UPDATE ON tasks WHEN NEW.title IS NOT OLD.title OR NEW.owner IS NOT OLD.owner OR NEW.status IS NOT OLD.status OR NEW.due_date IS NOT OLD.due_date OR NEW.priority IS NOT OLD.priority OR NEW.next_step IS NOT OLD.next_step OR NEW.project IS NOT OLD.project OR NEW.area IS NOT OLD.area BEGIN INSERT INTO notification_events(id,task_id,owner,kind,created_at) VALUES(lower(hex(randomblob(16))),NEW.id,NEW.owner,'updated',strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
