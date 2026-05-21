ALTER TABLE "users" ADD COLUMN "discord_access_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "discord_token_expires_at" timestamp with time zone;