ALTER TABLE academic_terms ADD COLUMN effectivity_start TEXT;
ALTER TABLE academic_terms ADD COLUMN effectivity_end TEXT;
CREATE TABLE faculty_loads (
 id TEXT PRIMARY KEY NOT NULL, faculty_id TEXT NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
 term_id TEXT NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
 research_hours REAL NOT NULL DEFAULT 1, extension_hours REAL NOT NULL DEFAULT 1, imp_hours REAL NOT NULL DEFAULT 0,
 consultation_hours REAL, effectivity_start TEXT, effectivity_end TEXT,
 CHECK(effectivity_end IS NULL OR effectivity_start IS NULL OR effectivity_end >= effectivity_start)
);
CREATE UNIQUE INDEX faculty_loads_faculty_id_term_id_key ON faculty_loads(faculty_id,term_id);
CREATE TABLE faculty_sessions (
 id TEXT PRIMARY KEY NOT NULL, faculty_id TEXT NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
 term_id TEXT NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
 type TEXT NOT NULL CHECK(type IN ('RESEARCH','EXTENSION','IMP','CONSULTATION','DESIGNATION','OVERLOAD')),
 faculty_designation_id TEXT REFERENCES faculty_designations(id) ON DELETE CASCADE,
 day_of_week TEXT NOT NULL CHECK(day_of_week IN ('MON','TUE','WED','THU','FRI','SAT')),
 start_time TEXT NOT NULL, end_time TEXT NOT NULL, deleted_at DATETIME,
 CHECK(end_time > start_time), CHECK((type='DESIGNATION' AND faculty_designation_id IS NOT NULL) OR (type!='DESIGNATION' AND faculty_designation_id IS NULL))
);
CREATE INDEX faculty_sessions_faculty_id_term_id_day_of_week_idx ON faculty_sessions(faculty_id,term_id,day_of_week);
CREATE UNIQUE INDEX faculty_sessions_active_slot_key ON faculty_sessions(faculty_id,term_id,day_of_week,start_time,end_time) WHERE deleted_at IS NULL;
CREATE TABLE faculty_section_students (
 id TEXT PRIMARY KEY NOT NULL, faculty_id TEXT NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
 section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
 term_id TEXT NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
 student_count INTEGER NOT NULL CHECK(student_count BETWEEN 0 AND 200)
);
CREATE UNIQUE INDEX faculty_section_students_faculty_id_section_id_term_id_key ON faculty_section_students(faculty_id,section_id,term_id);
CREATE TABLE form_settings (
 id TEXT PRIMARY KEY NOT NULL DEFAULT 'singleton' CHECK(id='singleton'),
 school_lines TEXT NOT NULL DEFAULT 'Republic of the Philippines
PALOMPON INSTITUTE OF TECHNOLOGY
Palompon, Leyte', college_lines TEXT NOT NULL DEFAULT 'COLLEGE OF TECHNOLOGY AND ENGINEERING',
 department TEXT NOT NULL DEFAULT 'Industrial Engineering', program TEXT NOT NULL DEFAULT 'BSIE',
 school_logo_path TEXT DEFAULT '/school-logo.jpg', tuv_logo_path TEXT
);
INSERT INTO form_settings(id) VALUES('singleton');
CREATE TABLE form_templates (type TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, ref_code TEXT NOT NULL, revision TEXT NOT NULL DEFAULT '00');
INSERT INTO form_templates(type,title,ref_code) VALUES
 ('FACULTY_CLASS_PROGRAM','FACULTY CLASS PROGRAM','PIT-COTE-FOR-3-2-01B'),
 ('STUDENT_CLASS_PROGRAM','STUDENT CLASS PROGRAM',''),
 ('CLASSROOM_UTILIZATION','CLASSROOM UTILIZATION','');
CREATE TABLE signatory_options(id TEXT PRIMARY KEY NOT NULL, slot TEXT NOT NULL, name TEXT NOT NULL, title TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT true);
INSERT INTO signatory_options(id,slot,name,title) VALUES
 ('9d642d40-5341-4f4c-8000-000000000001','PREPARED','Dearielyn C. Maskarino','Chairman'),
 ('9d642d40-5341-4f4c-8000-000000000002','REVIEWED','Ronald B. Lacaba','Dean'),
 ('9d642d40-5341-4f4c-8000-000000000003','APPROVED','Jennifer A. Gorumba','VP Academic Affairs');
