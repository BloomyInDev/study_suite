CREATE TABLE "user_students" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"student_group_id" uuid
);
--> statement-breakpoint
CREATE TABLE "user_teachers" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"teacher_id" uuid
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_student_group_id_student_groups_id_fk";
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_teacher_id_teachers_id_fk";
--> statement-breakpoint
ALTER TABLE "user_students" ADD CONSTRAINT "user_students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_students" ADD CONSTRAINT "user_students_student_group_id_student_groups_id_fk" FOREIGN KEY ("student_group_id") REFERENCES "public"."student_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_teachers" ADD CONSTRAINT "user_teachers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_teachers" ADD CONSTRAINT "user_teachers_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "student_group_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "teacher_id";