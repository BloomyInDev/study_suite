CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_id" text NOT NULL,
	"discord_username" text NOT NULL,
	"discord_avatar" text,
	"role" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"student_group_id" uuid,
	"teacher_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_discord_id_unique" UNIQUE("discord_id")
);
--> statement-breakpoint
CREATE TABLE "discord_guilds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_guild_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discord_guilds_discord_guild_id_unique" UNIQUE("discord_guild_id")
);
--> statement-breakpoint
CREATE TABLE "discord_role_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" uuid NOT NULL,
	"discord_role_id" text NOT NULL,
	"student_group_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discord_role_mappings_guild_role_uniq" UNIQUE("guild_id","discord_role_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_student_group_id_student_groups_id_fk" FOREIGN KEY ("student_group_id") REFERENCES "public"."student_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_role_mappings" ADD CONSTRAINT "discord_role_mappings_guild_id_discord_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."discord_guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_role_mappings" ADD CONSTRAINT "discord_role_mappings_student_group_id_student_groups_id_fk" FOREIGN KEY ("student_group_id") REFERENCES "public"."student_groups"("id") ON DELETE cascade ON UPDATE no action;