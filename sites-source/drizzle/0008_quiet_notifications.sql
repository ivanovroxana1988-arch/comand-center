DROP TRIGGER notification_task_created;
--> statement-breakpoint
CREATE TRIGGER notification_task_created AFTER INSERT ON tasks WHEN NEW.status!='Finalizat' BEGIN INSERT INTO notification_events(id,task_id,owner,kind,created_at) VALUES(lower(hex(randomblob(16))),NEW.id,NEW.owner,'created',strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
--> statement-breakpoint
DROP TRIGGER notification_task_updated;
--> statement-breakpoint
CREATE TRIGGER notification_task_assigned AFTER UPDATE ON tasks WHEN NEW.owner IS NOT OLD.owner AND NEW.status!='Finalizat' BEGIN INSERT INTO notification_events(id,task_id,owner,kind,created_at) VALUES(lower(hex(randomblob(16))),NEW.id,NEW.owner,'assigned',strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
