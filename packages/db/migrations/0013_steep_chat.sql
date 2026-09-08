CREATE TABLE "user_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"provider_sub_raw" text,
	"username" text,
	"email" text,
	"avatar_url" text,
	"access_token" text,
	"token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_identities_provider_subject_uniq" UNIQUE("provider","subject")
);
--> statement-breakpoint
CREATE TABLE "iut_group_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_value" text NOT NULL,
	"user_role" text DEFAULT 'student' NOT NULL,
	"student_group_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "iut_group_mappings_claim_value_unique" UNIQUE("claim_value")
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "discord_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "discord_username" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iut_group_mappings" ADD CONSTRAINT "iut_group_mappings_student_group_id_student_groups_id_fk" FOREIGN KEY ("student_group_id") REFERENCES "public"."student_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_identities_user_id_idx" ON "user_identities" USING btree ("user_id");--> statement-breakpoint
-- Backfill: every existing user is a Discord user, and stays reachable by the
-- same account once the login path reads user_identities instead of users.
INSERT INTO "user_identities" ("user_id", "provider", "subject", "username", "avatar_url", "access_token", "token_expires_at", "created_at", "updated_at")
SELECT "id", 'discord', "discord_id", "discord_username",
       CASE WHEN "discord_avatar" IS NULL THEN NULL
            ELSE 'https://cdn.discordapp.com/avatars/' || "discord_id" || '/' || "discord_avatar" || '.png' END,
       "discord_access_token", "discord_token_expires_at", "created_at", "updated_at"
FROM "users"
WHERE "discord_id" IS NOT NULL
ON CONFLICT DO NOTHING;
