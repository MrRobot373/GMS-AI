CREATE TABLE "conversation_log" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"workspace_id" text,
	"workspace_name" text,
	"chat_id" text,
	"chat_title" text,
	"user_id" text,
	"user_email" text,
	"user_name" text,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "conversation_log_days" integer DEFAULT 365 NOT NULL;--> statement-breakpoint
CREATE INDEX "conversation_log_time_idx" ON "conversation_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "conversation_log_user_idx" ON "conversation_log" USING btree ("user_id","created_at");