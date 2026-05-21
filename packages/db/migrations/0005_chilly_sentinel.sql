ALTER TABLE "discord_role_mappings" ALTER COLUMN "student_group_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "discord_role_mappings" ADD COLUMN "user_role" text DEFAULT 'student' NOT NULL;