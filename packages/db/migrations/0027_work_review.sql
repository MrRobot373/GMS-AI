ALTER TABLE "work_task" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "work_task" ADD COLUMN "verification" jsonb;--> statement-breakpoint
ALTER TABLE "work_task" ADD CONSTRAINT "work_task_parent_id_work_task_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."work_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_task_parent_idx" ON "work_task" USING btree ("parent_id");