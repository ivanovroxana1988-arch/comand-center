CREATE TABLE `workspace_revision` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);

--> statement-breakpoint
CREATE TRIGGER `workspace_tasks_insert` AFTER INSERT ON `tasks` BEGIN INSERT INTO workspace_revision(id,revision) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET revision=revision+1; END;

--> statement-breakpoint
CREATE TRIGGER `workspace_tasks_update` AFTER UPDATE ON `tasks` BEGIN INSERT INTO workspace_revision(id,revision) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET revision=revision+1; END;

--> statement-breakpoint
CREATE TRIGGER `workspace_tasks_delete` AFTER DELETE ON `tasks` BEGIN INSERT INTO workspace_revision(id,revision) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET revision=revision+1; END;

--> statement-breakpoint
CREATE TRIGGER `workspace_ecosystem_pages_insert` AFTER INSERT ON `ecosystem_pages` BEGIN INSERT INTO workspace_revision(id,revision) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET revision=revision+1; END;

--> statement-breakpoint
CREATE TRIGGER `workspace_ecosystem_pages_update` AFTER UPDATE ON `ecosystem_pages` BEGIN INSERT INTO workspace_revision(id,revision) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET revision=revision+1; END;

--> statement-breakpoint
CREATE TRIGGER `workspace_ecosystem_pages_delete` AFTER DELETE ON `ecosystem_pages` BEGIN INSERT INTO workspace_revision(id,revision) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET revision=revision+1; END;

--> statement-breakpoint
CREATE TRIGGER `workspace_organization_state_insert` AFTER INSERT ON `organization_state` BEGIN INSERT INTO workspace_revision(id,revision) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET revision=revision+1; END;

--> statement-breakpoint
CREATE TRIGGER `workspace_organization_state_update` AFTER UPDATE ON `organization_state` BEGIN INSERT INTO workspace_revision(id,revision) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET revision=revision+1; END;

--> statement-breakpoint
CREATE TRIGGER `workspace_organization_state_delete` AFTER DELETE ON `organization_state` BEGIN INSERT INTO workspace_revision(id,revision) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET revision=revision+1; END;

--> statement-breakpoint
CREATE TRIGGER `workspace_task_attachments_insert` AFTER INSERT ON `task_attachments` BEGIN INSERT INTO workspace_revision(id,revision) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET revision=revision+1; END;

--> statement-breakpoint
CREATE TRIGGER `workspace_task_attachments_update` AFTER UPDATE ON `task_attachments` BEGIN INSERT INTO workspace_revision(id,revision) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET revision=revision+1; END;

--> statement-breakpoint
CREATE TRIGGER `workspace_task_attachments_delete` AFTER DELETE ON `task_attachments` BEGIN INSERT INTO workspace_revision(id,revision) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET revision=revision+1; END;

--> statement-breakpoint
CREATE TRIGGER `workspace_tenders_insert` AFTER INSERT ON `tenders` BEGIN INSERT INTO workspace_revision(id,revision) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET revision=revision+1; END;

--> statement-breakpoint
CREATE TRIGGER `workspace_tenders_update` AFTER UPDATE ON `tenders` BEGIN INSERT INTO workspace_revision(id,revision) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET revision=revision+1; END;

--> statement-breakpoint
CREATE TRIGGER `workspace_tenders_delete` AFTER DELETE ON `tenders` BEGIN INSERT INTO workspace_revision(id,revision) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET revision=revision+1; END;

--> statement-breakpoint
CREATE TRIGGER `workspace_licitatii_records_insert` AFTER INSERT ON `licitatii_records` BEGIN INSERT INTO workspace_revision(id,revision) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET revision=revision+1; END;

--> statement-breakpoint
CREATE TRIGGER `workspace_licitatii_records_update` AFTER UPDATE ON `licitatii_records` BEGIN INSERT INTO workspace_revision(id,revision) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET revision=revision+1; END;

--> statement-breakpoint
CREATE TRIGGER `workspace_licitatii_records_delete` AFTER DELETE ON `licitatii_records` BEGIN INSERT INTO workspace_revision(id,revision) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET revision=revision+1; END;
