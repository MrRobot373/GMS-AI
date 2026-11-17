ALTER TABLE "chat" ADD COLUMN "shared_can_reply" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "author_id" text;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "message" m SET "author_id" = c."user_id" FROM "chat" c WHERE m."chat_id" = c."id" AND m."role" = 'user';
