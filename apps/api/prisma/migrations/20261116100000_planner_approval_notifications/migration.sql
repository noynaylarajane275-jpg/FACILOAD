CREATE TABLE "planner_drafts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "faculty_id" TEXT NOT NULL,
  "term_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "sessions_json" TEXT NOT NULL DEFAULT '[]',
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "planner_drafts_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculty" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "planner_drafts_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "academic_terms" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "planner_drafts_faculty_id_term_id_key" ON "planner_drafts"("faculty_id", "term_id");
CREATE INDEX "planner_drafts_term_id_idx" ON "planner_drafts"("term_id");

CREATE TABLE "planner_submissions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "faculty_id" TEXT NOT NULL,
  "term_id" TEXT NOT NULL,
  "draft_revision" INTEGER NOT NULL,
  "sessions_json" TEXT NOT NULL,
  "teaching_json" TEXT NOT NULL,
  "load_json" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "feedback" TEXT NOT NULL DEFAULT '',
  "submitted_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" DATETIME,
  "reviewed_by_user_id" TEXT,
  CONSTRAINT "planner_submissions_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculty" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "planner_submissions_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "academic_terms" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "planner_submissions_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "planner_submissions_faculty_id_term_id_status_idx" ON "planner_submissions"("faculty_id", "term_id", "status");
CREATE INDEX "planner_submissions_status_submitted_at_idx" ON "planner_submissions"("status", "submitted_at");
CREATE UNIQUE INDEX "planner_submissions_one_pending_per_faculty_term_idx" ON "planner_submissions"("faculty_id", "term_id") WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX "planner_submissions_one_approved_per_faculty_term_idx" ON "planner_submissions"("faculty_id", "term_id") WHERE "status" = 'APPROVED';

CREATE TABLE "planner_notifications" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "recipient_user_id" TEXT NOT NULL,
  "submission_id" TEXT,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "read_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "planner_notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "planner_notifications_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "planner_submissions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "planner_notifications_recipient_user_id_read_at_created_at_idx" ON "planner_notifications"("recipient_user_id", "read_at", "created_at");
CREATE INDEX "planner_notifications_submission_id_idx" ON "planner_notifications"("submission_id");
