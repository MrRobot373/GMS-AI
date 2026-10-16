CREATE TABLE "sso_session" (
	"session_id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"name_id" text NOT NULL,
	"name_id_format" text,
	"session_index" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "scim_settings" jsonb;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "ldap_settings" jsonb;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "saml_signing" jsonb;--> statement-breakpoint
ALTER TABLE "sso_connection" ADD COLUMN "saml_slo_url" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "directory" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "directory_disabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_group" ADD COLUMN "directory" text;--> statement-breakpoint
ALTER TABLE "user_group" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "sso_session" ADD CONSTRAINT "sso_session_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_session" ADD CONSTRAINT "sso_session_connection_id_sso_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."sso_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sso_session_name_idx" ON "sso_session" USING btree ("connection_id","name_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_directory_external_idx" ON "user" USING btree ("directory","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_group_directory_external_idx" ON "user_group" USING btree ("directory","external_id");