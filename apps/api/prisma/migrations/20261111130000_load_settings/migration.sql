CREATE TABLE "load_settings" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton' CHECK ("id" = 'singleton'),
  "lab_coefficient" REAL NOT NULL DEFAULT 0.7,
  "weekly_hours" REAL NOT NULL DEFAULT 40,
  "consultation_hours" REAL NOT NULL DEFAULT 4,
  "min_research" REAL NOT NULL DEFAULT 1,
  "min_extension" REAL NOT NULL DEFAULT 1,
  "min_imp" REAL NOT NULL DEFAULT 0,
  "min_session_hours" REAL NOT NULL DEFAULT 1,
  "prep_tiers_json" TEXT NOT NULL DEFAULT '[{"minPreps":1,"maxPreps":2,"ceiling":21},{"minPreps":3,"maxPreps":4,"ceiling":18},{"minPreps":5,"maxPreps":6,"ceiling":15}]'
);
INSERT INTO "load_settings" ("id") VALUES ('singleton');
