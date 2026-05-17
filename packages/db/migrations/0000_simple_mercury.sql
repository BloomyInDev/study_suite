CREATE TYPE "public"."change_type" AS ENUM('added', 'removed', 'updated');--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'prose' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "locations_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	CONSTRAINT "teachers_name_unique" UNIQUE("first_name","last_name")
);
--> statement-breakpoint
CREATE TABLE "student_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"internal_name" text NOT NULL,
	CONSTRAINT "student_groups_internal_name_unique" UNIQUE("internal_name")
);
--> statement-breakpoint
CREATE TABLE "event_locations" (
	"event_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	CONSTRAINT "event_locations_event_id_location_id_pk" PRIMARY KEY("event_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "event_student_groups" (
	"event_id" uuid NOT NULL,
	"student_group_id" uuid NOT NULL,
	CONSTRAINT "event_student_groups_event_id_student_group_id_pk" PRIMARY KEY("event_id","student_group_id")
);
--> statement-breakpoint
CREATE TABLE "event_teachers" (
	"event_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	CONSTRAINT "event_teachers_event_id_teacher_id_pk" PRIMARY KEY("event_id","teacher_id")
);
--> statement-breakpoint
CREATE TABLE "event_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"change_type" "change_type" NOT NULL,
	"event_title" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"diff" jsonb,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_locations" ADD CONSTRAINT "event_locations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_locations" ADD CONSTRAINT "event_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_student_groups" ADD CONSTRAINT "event_student_groups_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_student_groups" ADD CONSTRAINT "event_student_groups_student_group_id_student_groups_id_fk" FOREIGN KEY ("student_group_id") REFERENCES "public"."student_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_teachers" ADD CONSTRAINT "event_teachers_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_teachers" ADD CONSTRAINT "event_teachers_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;