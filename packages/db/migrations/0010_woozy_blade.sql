ALTER TABLE "student_groups" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "student_groups" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;