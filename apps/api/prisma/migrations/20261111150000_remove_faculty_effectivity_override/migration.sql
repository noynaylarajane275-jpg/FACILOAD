CREATE TABLE faculty_loads_without_effectivity (
  id TEXT PRIMARY KEY NOT NULL,
  faculty_id TEXT NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
  term_id TEXT NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  research_hours REAL NOT NULL DEFAULT 1,
  extension_hours REAL NOT NULL DEFAULT 1,
  imp_hours REAL NOT NULL DEFAULT 0,
  consultation_hours REAL
);

INSERT INTO faculty_loads_without_effectivity (
  id, faculty_id, term_id, research_hours, extension_hours, imp_hours, consultation_hours
)
SELECT id, faculty_id, term_id, research_hours, extension_hours, imp_hours, consultation_hours
FROM faculty_loads;

DROP TABLE faculty_loads;
ALTER TABLE faculty_loads_without_effectivity RENAME TO faculty_loads;
CREATE UNIQUE INDEX faculty_loads_faculty_id_term_id_key ON faculty_loads(faculty_id, term_id);
