CREATE TYPE "public"."course_level" AS ENUM('basic', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."course_status" AS ENUM('generating', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."lesson_status" AS ENUM('pending', 'generating', 'ready', 'failed');--> statement-breakpoint
ALTER TYPE "public"."section" ADD VALUE 'learning';--> statement-breakpoint
ALTER TYPE "public"."section" ADD VALUE 'knowledge';--> statement-breakpoint
CREATE TABLE "calculator_favorite" (
	"user_id" text NOT NULL,
	"calculator_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calculator_favorite_user_id_calculator_id_pk" PRIMARY KEY("user_id","calculator_id")
);
--> statement-breakpoint
CREATE TABLE "calculator_history" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"calculator_id" text NOT NULL,
	"kind" text DEFAULT 'formula' NOT NULL,
	"formula_version" integer,
	"inputs" jsonb NOT NULL,
	"outputs" jsonb NOT NULL,
	"source" text DEFAULT 'calculators' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"topic" text NOT NULL,
	"level" "course_level" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"status" "course_status" DEFAULT 'generating' NOT NULL,
	"error" text,
	"outline" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"outline_history" jsonb,
	"model_id" text,
	"last_lesson" integer,
	"last_opened_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_lesson" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"course_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"current" boolean DEFAULT true NOT NULL,
	"title" text NOT NULL,
	"status" "lesson_status" DEFAULT 'pending' NOT NULL,
	"content" jsonb,
	"videos" jsonb,
	"videos_checked_at" timestamp with time zone,
	"videos_note" text,
	"error" text,
	"model_id" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_lesson_state" (
	"course_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"user_id" text NOT NULL,
	"completed_at" timestamp with time zone,
	"bookmarked_at" timestamp with time zone,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_lesson_state_course_id_ordinal_user_id_pk" PRIMARY KEY("course_id","ordinal","user_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge_query" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"question" text NOT NULL,
	"answer" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'answered' NOT NULL,
	"error" text,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"include_general" boolean DEFAULT false NOT NULL,
	"model_id" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "youtube_cache" (
	"query_hash" text PRIMARY KEY NOT NULL,
	"query" text NOT NULL,
	"results" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "reference" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "gem_settings" jsonb;--> statement-breakpoint
ALTER TABLE "calculator_favorite" ADD CONSTRAINT "calculator_favorite_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculator_history" ADD CONSTRAINT "calculator_history_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculator_history" ADD CONSTRAINT "calculator_history_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_model_id_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."model"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_lesson" ADD CONSTRAINT "course_lesson_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_lesson" ADD CONSTRAINT "course_lesson_model_id_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."model"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_lesson_state" ADD CONSTRAINT "course_lesson_state_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_lesson_state" ADD CONSTRAINT "course_lesson_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_query" ADD CONSTRAINT "knowledge_query_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_query" ADD CONSTRAINT "knowledge_query_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_query" ADD CONSTRAINT "knowledge_query_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_query" ADD CONSTRAINT "knowledge_query_model_id_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."model"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calc_history_user_idx" ON "calculator_history" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "course_user_idx" ON "course" USING btree ("user_id","workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "course_fts_idx" ON "course" USING gin (to_tsvector('simple', "title" || ' ' || "topic"));--> statement-breakpoint
CREATE UNIQUE INDEX "course_lesson_version_idx" ON "course_lesson" USING btree ("course_id","ordinal","version");--> statement-breakpoint
CREATE INDEX "course_lesson_current_idx" ON "course_lesson" USING btree ("course_id","current","ordinal");--> statement-breakpoint
CREATE INDEX "lesson_state_user_idx" ON "course_lesson_state" USING btree ("user_id","bookmarked_at");--> statement-breakpoint
CREATE INDEX "knowledge_query_idx" ON "knowledge_query" USING btree ("project_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "document_hash_idx" ON "document" USING btree ("workspace_id","content_hash");--> statement-breakpoint
-- GEM AI modules are on for everyone who has chat (admins can switch them off per person).
UPDATE "workspace_member" SET "sections" = "sections" || ARRAY['learning','calculators','knowledge']::text[] WHERE 'chat' = ANY("sections");
