CREATE TABLE "video_block" (
	"video_id" text PRIMARY KEY NOT NULL,
	"blocked_by" text,
	"reason" text,
	"title" text,
	"channel" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_feedback" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"lesson_id" text,
	"video_id" text NOT NULL,
	"rating" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "video_block" ADD CONSTRAINT "video_block_blocked_by_user_id_fk" FOREIGN KEY ("blocked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_feedback" ADD CONSTRAINT "video_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_feedback" ADD CONSTRAINT "video_feedback_lesson_id_course_lesson_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."course_lesson"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "video_feedback_user_video_idx" ON "video_feedback" USING btree ("user_id","video_id");--> statement-breakpoint
CREATE INDEX "video_feedback_video_idx" ON "video_feedback" USING btree ("video_id");