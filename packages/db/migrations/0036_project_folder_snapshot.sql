ALTER TABLE "project" ADD COLUMN "work_folder" text;--> statement-breakpoint
ALTER TABLE "work_task" ADD COLUMN "work_snapshot" jsonb;