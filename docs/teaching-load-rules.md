# Teaching Load

The API calculation lives in `apps/api/src/services/teaching-load.service.ts`;
its configurable defaults are in `teaching-load.config.ts`. The calculation
uses active workload assignments, the faculty member's saved term functions,
and active designation assignments.

## Defaults

| Setting | Default | Meaning |
|---|---:|---|
| Lab coefficient | 0.7 | Share of lab hours counted toward teaching hours |
| Weekly target | 40 hours | Full-time faculty time target |
| 1–2 preps | 21 hours | Prep ceiling |
| 3–4 preps | 18 hours | Prep ceiling |
| 5–6 preps | 15 hours | Prep ceiling |
| Consultation | 4 hours | Expected weekly consultation |
| Research minimum | 1 hour | Warning threshold |
| Extension minimum | 1 hour | Warning threshold |
| IMP minimum | 0 hours | No warning threshold |

## Calculation

1. Lecture and lab hours are summed across every active section assignment.
2. Weighted lab hours are `lab_hours × 0.7`; teaching hours are lecture plus
   weighted lab hours.
3. Preps count distinct subjects with lecture hours plus distinct subjects
   with lab hours. A subject with both counts as two preps; extra sections do
   not add preps.
4. The prep ceiling follows the table above. Seven or more preps use the
   highest ceiling and produce a warning.
5. Teaching overload is `max(0, teaching_hours − prep_ceiling)`, rounded to
   two decimals. Whole hours are claimable; the fractional remainder is
   teaching service credit.
6. Plotted overload is the saved cumulative term total. Remaining hours are
   `max(0, claimable − plotted)`. Plotting above the claimable total produces
   a warning.
7. Regular teaching credit is the lower of teaching hours and the prep
   ceiling. Overload stays outside the weekly 40-hour target.
8. Total faculty time is regular teaching plus research, extension, IMP,
   consultation, and designation hours. Remaining-to-target is `40 − total`.
9. Designation service credits are counted only for catalog entries marked as
   granting service credit, and stay outside the 40-hour total.

## Saved inputs and access

Research, extension, IMP, consultation, and plotted overload are saved per
faculty member and academic term in `faculty_teaching_load_details`.
Designation definitions live in the chair-managed catalog; faculty assignments
are saved per faculty member and term. Faculty accounts can read their own
load; the Chair can view and edit loads across the department.

The Teaching Load page includes a print layout. **Print / Save PDF** opens the
browser's print dialog with the selected faculty member, term, calculations,
functions, designations, warnings, and course assignment table.
