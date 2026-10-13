ALTER TYPE "public"."sso_type" ADD VALUE 'saml';--> statement-breakpoint
ALTER TABLE "sso_connection" ALTER COLUMN "client_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sso_connection" ALTER COLUMN "client_secret_enc" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sso_connection" ADD COLUMN "saml_sso_url" text;--> statement-breakpoint
ALTER TABLE "sso_connection" ADD COLUMN "saml_certs" text[];