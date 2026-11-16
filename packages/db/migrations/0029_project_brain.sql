CREATE TABLE "brain_entry" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"project_id" text NOT NULL,
	"page_id" text NOT NULL,
	"kind" text DEFAULT 'fact' NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"replaces_id" text,
	"conflict" boolean DEFAULT false NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" text,
	"source_label" text DEFAULT '' NOT NULL,
	"quote" text DEFAULT '' NOT NULL,
	"author_id" text,
	"decided_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_log" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"project_id" text NOT NULL,
	"entry_id" text,
	"action" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_page" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "brain_mode" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "brain_entry" ADD CONSTRAINT "brain_entry_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_entry" ADD CONSTRAINT "brain_entry_page_id_brain_page_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."brain_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_entry" ADD CONSTRAINT "brain_entry_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_entry" ADD CONSTRAINT "brain_entry_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_log" ADD CONSTRAINT "brain_log_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_log" ADD CONSTRAINT "brain_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_page" ADD CONSTRAINT "brain_page_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brain_entry_project_idx" ON "brain_entry" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "brain_entry_page_idx" ON "brain_entry" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "brain_log_project_idx" ON "brain_log" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_page_project_slug_idx" ON "brain_page" USING btree ("project_id","slug");