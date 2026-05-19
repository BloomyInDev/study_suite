CREATE TABLE "student_group_memberships" (
	"parent_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	CONSTRAINT "student_group_memberships_parent_id_child_id_pk" PRIMARY KEY("parent_id","child_id")
);
--> statement-breakpoint
ALTER TABLE "student_group_memberships" ADD CONSTRAINT "student_group_memberships_parent_id_student_groups_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."student_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_group_memberships" ADD CONSTRAINT "student_group_memberships_child_id_student_groups_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."student_groups"("id") ON DELETE cascade ON UPDATE no action;