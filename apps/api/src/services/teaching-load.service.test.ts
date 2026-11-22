import { describe, expect, it } from 'vitest';
import { calculateTeachingLoad as compute, DEFAULT_LOAD_CONFIG, type TeachingLoadInput } from './teaching-load.service.js';

// Existing fixtures model fully plotted functions/designations. Explicitly supply those sessions.
const calculateTeachingLoad = (input: TeachingLoadInput) => compute({ ...input,
  functionPlottedHours: input.otherFunctions,
  designations: input.designations?.map((d) => ({ ...d, plotted_hours: d.hours })),
});

const BASE_OTHER_FUNCTIONS = {
  research: 1,
  extension: 1,
  imp: 0,
  consultation: 4,
};

function assignmentsOf(
  subjectId: string,
  sections: { lecture_hours: number; lab_hours: number }[],
) {
  return sections.map((s) => ({ subject_id: subjectId, ...s }));
}

describe('calculateTeachingLoad (pure engine)', () => {
  it('case 1 — one section lec 3 / lab 3', () => {
    const out = calculateTeachingLoad({
      assignments: assignmentsOf('IE322', [{ lecture_hours: 3, lab_hours: 3 }]),
      otherFunctions: BASE_OTHER_FUNCTIONS,
    });
    expect(out.lecture_hours).toBe(3);
    expect(out.lab_hours).toBe(3);
    expect(out.weighted_lab_hours).toBe(2.1);
    expect(out.teaching_hours).toBe(5.1);
    expect(out.regular_teaching_hours).toBe(5.1);
    expect(out.preps).toBe(2);
    expect(out.prep_ceiling).toBe(21);
    expect(out.prep_ceiling_source).toBe('TIER');
    expect(out.teaching_overload).toBe(0);
    expect(out.claimable_overload_hours).toBe(0);
    expect(out.teaching_service_credit).toBe(0);
    expect(out.warnings).toEqual([]);
  });

  it('case 2 — same subject, 5 sections lec 3 / lab 3', () => {
    const out = calculateTeachingLoad({
      assignments: assignmentsOf('IE322', Array(5).fill({ lecture_hours: 3, lab_hours: 3 })),
      otherFunctions: BASE_OTHER_FUNCTIONS,
    });
    expect(out.lecture_hours).toBe(15);
    expect(out.lab_hours).toBe(15);
    expect(out.weighted_lab_hours).toBe(10.5);
    expect(out.teaching_hours).toBe(25.5);
    expect(out.preps).toBe(2);
    expect(out.prep_ceiling).toBe(21);
    expect(out.prep_ceiling_source).toBe('TIER');
    expect(out.teaching_overload).toBe(4.5);
    expect(out.claimable_overload_hours).toBe(4);
    expect(out.teaching_service_credit).toBe(0.5);
    expect(out.regular_teaching_hours).toBe(21);
  });

  it('case 3 — two subjects lec 9 / lab 5.5 each', () => {
    const out = calculateTeachingLoad({
      assignments: [
        { subject_id: 'SUBJ1', lecture_hours: 9, lab_hours: 5.5 },
        { subject_id: 'SUBJ2', lecture_hours: 9, lab_hours: 5.5 },
      ],
      otherFunctions: BASE_OTHER_FUNCTIONS,
    });
    expect(out.lecture_hours).toBe(18);
    expect(out.lab_hours).toBe(11);
    expect(out.weighted_lab_hours).toBe(7.7);
    expect(out.teaching_hours).toBe(25.7);
    expect(out.preps).toBe(4);
    expect(out.prep_ceiling).toBe(18);
    expect(out.prep_ceiling_source).toBe('TIER');
    expect(out.teaching_overload).toBe(7.7);
    expect(out.claimable_overload_hours).toBe(7);
    expect(out.teaching_service_credit).toBe(0.7);
  });

  it('case 4 — prep tiers map correctly', () => {
    const tierCases: [number, number, 'TIER' | 'EXTRAPOLATED' | 'NONE'][] = [
      [2, 21, 'TIER'],
      [3, 18, 'TIER'],
      [4, 18, 'TIER'],
      [5, 15, 'TIER'],
      [6, 15, 'TIER'],
      [7, 15, 'EXTRAPOLATED'],
      [0, 0, 'NONE'],
    ];
    for (const [preps, ceiling, source] of tierCases) {
      const out =
        preps === 0
          ? calculateTeachingLoad({ assignments: [], otherFunctions: BASE_OTHER_FUNCTIONS })
          : calculateTeachingLoad({
              assignments: Array.from({ length: preps }, (_, i) => ({
                subject_id: `SUBJ-${i}`,
                lecture_hours: 3,
                lab_hours: 0,
              })),
              otherFunctions: BASE_OTHER_FUNCTIONS,
            });
      expect(out.preps).toBe(preps);
      expect(out.prep_ceiling).toBe(ceiling);
      expect(out.prep_ceiling_source).toBe(source);
    }

    const extrapolated = calculateTeachingLoad({
      assignments: Array.from({ length: 7 }, (_, i) => ({
        subject_id: `SUBJ-${i}`,
        lecture_hours: 3,
        lab_hours: 0,
      })),
      otherFunctions: BASE_OTHER_FUNCTIONS,
    });
    expect(extrapolated.warnings.some((w) => w.includes('exceed'))).toBe(true);
  });

  it('case 5 — one subject lec 3 across 3 sections → lecture 9, preps 1', () => {
    const out = calculateTeachingLoad({
      assignments: assignmentsOf('SAME', [
        { lecture_hours: 3, lab_hours: 0 },
        { lecture_hours: 3, lab_hours: 0 },
        { lecture_hours: 3, lab_hours: 0 },
      ]),
      otherFunctions: BASE_OTHER_FUNCTIONS,
    });
    expect(out.lecture_hours).toBe(9);
    expect(out.preps).toBe(1);
  });

  it('case 6 — float safety: lab 3 → weighted_lab_hours exactly 2.1', () => {
    const out = calculateTeachingLoad({
      assignments: [{ subject_id: 'X', lecture_hours: 0, lab_hours: 3 }],
      otherFunctions: BASE_OTHER_FUNCTIONS,
    });
    expect(out.weighted_lab_hours).toBe(2.1);
  });

  it('case 7 — 40-hour composition: total exactly 40, no over-target warning', () => {
    const out = calculateTeachingLoad({
      assignments: assignmentsOf('IE322', Array(5).fill({ lecture_hours: 3, lab_hours: 3 })),
      otherFunctions: { research: 6, extension: 4, imp: 2, consultation: 4 },
      designations: [{ name: 'Dept Chair', hours: 3, service_credit: 0, grants_service_credit: false }],
    });
    expect(out.regular_teaching_hours).toBe(21);
    expect(out.total_faculty_time).toBe(40);
    expect(out.remaining_to_target).toBe(0);
    expect(out.warnings.some((w) => w.includes('exceeds'))).toBe(false);
  });

  it('case 8 — service credits: only grants=true counts, not in the 40', () => {
    const out = calculateTeachingLoad({
      otherFunctions: BASE_OTHER_FUNCTIONS,
      designations: [
        { name: 'A', hours: 3, service_credit: 2, grants_service_credit: true },
        { name: 'B', hours: 6, service_credit: 3, grants_service_credit: false },
      ],
    });
    expect(out.service_credits).toBe(2);
    expect(out.designation_hours).toBe(9);
    expect(out.total_faculty_time).toBe(15);
  });

  it('case 9 — warnings: research 0 warns, imp 0 does not, consultation 3 warns', () => {
    const out = calculateTeachingLoad({
      otherFunctions: { research: 0, extension: 1, imp: 0, consultation: 3 },
    });
    expect(out.warnings.some((w) => w.includes('Research'))).toBe(true);
    expect(out.warnings.some((w) => w.includes('Consultation'))).toBe(true);
    expect(out.warnings.some((w) => w.includes('imp'))).toBe(false);
  });

  it('case 10 — overload plotting', () => {
    const base = {
      assignments: assignmentsOf('IE322', Array(5).fill({ lecture_hours: 3, lab_hours: 3 })),
      otherFunctions: BASE_OTHER_FUNCTIONS,
    };

    const plotted3 = calculateTeachingLoad({ ...base, overload_plotted_hours: 3 });
    expect(plotted3.claimable_overload_hours).toBe(4);
    expect(plotted3.overload_remaining_to_plot).toBe(1);
    expect(plotted3.claim_session_hours).toBe(3);
    expect(plotted3.warnings.some((w) => w.includes('exceeds claimable'))).toBe(false);

    const plotted5 = calculateTeachingLoad({ ...base, overload_plotted_hours: 5 });
    expect(plotted5.claim_session_hours).toBe(4);
    expect(plotted5.overload_remaining_to_plot).toBe(0);
    expect(plotted5.warnings.some((w) => w.includes('exceeds claimable'))).toBe(true);
  });
});
