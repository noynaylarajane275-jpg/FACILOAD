import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // One active term for local/dev (database-specification.md §9).
  const termExisting = await prisma.academicTerm.findUnique({
    where: { school_year_semester: { school_year: '2026-2027', semester: 'FIRST' } },
  });
  if (termExisting) {
    await prisma.academicTerm.update({
      where: { id: termExisting.id },
      data: { is_active: true },
    });
  } else {
    await prisma.academicTerm.create({
      data: { school_year: '2026-2027', semester: 'FIRST', is_active: true },
    });
  }
  const term = await prisma.academicTerm.findUnique({
    where: { school_year_semester: { school_year: '2026-2027', semester: 'FIRST' } },
  });
  if (!term) {
    throw new Error('The active academic term could not be loaded after seeding.');
  }

  // Department rooms.
  for (const name of ['INT Lab 1', 'INT Lab 2', 'Room 301', 'Room 302']) {
    await prisma.room.upsert({ where: { name }, update: {}, create: { name } });
  }

  // Starter IE subject catalog (units/lecture/lab hours are dev-plausible examples).
  // INT 105/INT 322/INT 411 all carry BOTH lecture and lab hours so the Schedule
  // sidebar shows a LECTURE card and a LAB card per subject (each rendered by
  // its own `remaining_*_hours > 0` check — neither gates the other).
  // The `update` clause re-applies the hours on re-seed: the original seed used
  // `update: {}`, so databases seeded before a seed fix kept stale (e.g.
  // lecture_hours: 0) rows forever — the root cause of "no LECTURE cards".
  const subjects = [
    { code: 'INT 105', title: 'Introduction to Industrial Technology', units: 3, lecture_hours: 2, lab_hours: 2 },
    { code: 'INT 322', title: 'Industrial Technology Operations', units: 3, lecture_hours: 2, lab_hours: 2 },
    { code: 'INT 411', title: 'Industrial Technology Methods', units: 4, lecture_hours: 2, lab_hours: 3 },
  ];
  for (const s of subjects) {
    // find-then-write instead of upsert: `subjects.code` has a partial unique
    // index (soft-delete aware), and SQLite's `ON CONFLICT("code")` cannot
    // target a partial index — upsert fails with "ON CONFLICT clause does not
    // match any PRIMARY KEY or UNIQUE constraint".
    const existing = await prisma.subject.findUnique({ where: { code: s.code } });
    if (existing) {
      await prisma.subject.update({
        where: { id: existing.id },
        data: { title: s.title, units: s.units, lecture_hours: s.lecture_hours, lab_hours: s.lab_hours },
      });
    } else {
      await prisma.subject.create({ data: s });
    }
  }

  // DEV-ONLY Chair credentials. Never use these outside local development.
  const chairEmail = 'admin@faciload.local';
  const chairPasswordHash = await bcrypt.hash('password', 10);
  const legacyChair = await prisma.user.findUnique({
    where: { email: 'chair.dev@faciload.local' },
  });
  const previousChair = await prisma.user.findUnique({
    where: { email: 'testchair@gmail.com' },
  });
  const previousSeededChair = await prisma.user.findUnique({
    where: { email: 'testgmail@gmail.com' },
  });
  const existingChair = await prisma.user.findUnique({
    where: { email: chairEmail },
  });
  const chairToMigrate = legacyChair ?? previousChair ?? previousSeededChair;
  if (chairToMigrate && !existingChair) {
    await prisma.user.update({
      where: { id: chairToMigrate.id },
      data: { email: chairEmail, password_hash: chairPasswordHash, role: 'CHAIR' },
    });
  } else {
    await prisma.user.upsert({
      where: { email: chairEmail },
      update: { password_hash: chairPasswordHash, role: 'CHAIR' },
      create: {
        email: chairEmail,
        password_hash: chairPasswordHash,
        role: 'CHAIR',
      },
    });
  }
  // Sections + faculty, so every filter dropdown and the Workload Assignment
  // page's form (faculty × subject × section) have real options on a fresh
  // database. No WorkloadAssignments are seeded on purpose: the Workload
  // Assignment page is the intended first-run path for creating them.
  for (const section of [
    { year_level: 1, name: 'INT 1A' },
    { year_level: 2, name: 'INT 2A' },
    { year_level: 3, name: 'INT 3A' },
    { year_level: 4, name: 'INT 4A' },
  ]) {
    await prisma.section.upsert({
      where: { year_level_name: section },
      update: {},
      create: section,
    });
  }

  const facultySeed = [
    { employee_no: 'INT-0001', first_name: 'Maria', last_name: 'Santos', rank: 'Assistant Professor' },
    { employee_no: 'INT-0002', first_name: 'Jose', last_name: 'Reyes', rank: 'Instructor I' },
    { employee_no: 'INT-0003', first_name: 'Liza', last_name: 'Cruz', rank: 'Professor' },
  ];
  for (const member of facultySeed) {
    // `faculty.employee_no` also has a partial unique index — find-then-write
    // for the same reason as the subject loop above. The old `update: {}` was
    // a no-op anyway, so an existing row is simply left alone.
    const existing = await prisma.faculty.findUnique({
      where: { employee_no: member.employee_no },
    });
    if (!existing) {
      await prisma.faculty.create({ data: member });
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[seed] term=${term.school_year} ${term.semester} rooms=4 subjects=3 sections=4 faculty=3 users=2`,
  );
}

main()
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[seed] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
