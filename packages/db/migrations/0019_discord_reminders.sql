CREATE TABLE "discord_reminder_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discord_reminder_sends_user_event_uniq" UNIQUE("user_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "discord_reminders" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"lead_minutes" integer DEFAULT 15 NOT NULL,
	"last_delivered_at" timestamp with time zone,
	"last_failure" text,
	"last_failure_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discord_reminder_sends" ADD CONSTRAINT "discord_reminder_sends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_reminders" ADD CONSTRAINT "discord_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discord_reminder_sends_sent_at_idx" ON "discord_reminder_sends" USING btree ("sent_at");