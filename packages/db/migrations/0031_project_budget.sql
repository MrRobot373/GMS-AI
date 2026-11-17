ALTER TABLE "project" ADD COLUMN "token_limit" bigint;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "member_token_limit" bigint;--> statement-breakpoint
ALTER TABLE "project_member" ADD COLUMN "token_limit" bigint;--> statement-breakpoint
ALTER TABLE "usage_event" ADD COLUMN "project_id" text;--> statement-breakpoint
CREATE INDEX "usage_project_time_idx" ON "usage_event" USING btree ("project_id","created_at");