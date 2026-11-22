-- Designation catalog and term-specific faculty designation assignments.
CREATE TABLE "designations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "default_hours" REAL NOT NULL,
    "service_credit_hours" REAL NOT NULL DEFAULT 0,
    "grants_service_credit" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" DATETIME
);

CREATE TABLE "faculty_designations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "faculty_id" TEXT NOT NULL,
    "designation_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "hours" REAL NOT NULL,
    "service_credit" REAL NOT NULL DEFAULT 0,
    "assigned_by_user_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" DATETIME,
    CONSTRAINT "faculty_designations_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculty" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "faculty_designations_designation_id_fkey" FOREIGN KEY ("designation_id") REFERENCES "designations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "faculty_designations_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "academic_terms" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "faculty_designations_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "designations_name_idx" ON "designations"("name");
CREATE INDEX "faculty_designations_faculty_id_idx" ON "faculty_designations"("faculty_id");
CREATE INDEX "faculty_designations_designation_id_idx" ON "faculty_designations"("designation_id");
CREATE INDEX "faculty_designations_term_id_idx" ON "faculty_designations"("term_id");
CREATE UNIQUE INDEX "designations_name_key" ON "designations"("name") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "faculty_designations_faculty_id_designation_id_term_id_key" ON "faculty_designations"("faculty_id", "designation_id", "term_id") WHERE "deleted_at" IS NULL;

-- Persist other weekly functions and overload plotting per faculty and term.
CREATE TABLE "faculty_teaching_load_details" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "faculty_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "research" REAL NOT NULL DEFAULT 0,
    "extension" REAL NOT NULL DEFAULT 0,
    "imp" REAL NOT NULL DEFAULT 0,
    "consultation" REAL NOT NULL DEFAULT 0,
    "overload_plotted_hours" REAL NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "faculty_teaching_load_details_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculty" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "faculty_teaching_load_details_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "academic_terms" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "faculty_teaching_load_details_faculty_id_term_id_key" ON "faculty_teaching_load_details"("faculty_id", "term_id");
CREATE INDEX "faculty_teaching_load_details_term_id_idx" ON "faculty_teaching_load_details"("term_id");
