import { prisma } from '../config/prisma.js';
import { DEFAULT_LOAD_CONFIG, type TeachingLoadConfig } from './teaching-load.config.js';
import { getLoadConfig } from './load-settings.service.js';
import * as programRepository from '../repositories/faculty-program.repository.js';

export { DEFAULT_LOAD_CONFIG };

/* -------------------------------------------------------------------------- */
/* Input / output shapes                                                      */
/* -------------------------------------------------------------------------- */

export interface TeachingLoadAssignmentInput {
  subject_id: string;
  lecture_hours: number;
  lab_hours: number;
}

export interface TeachingLoadOtherFunctions {
  research?: number;
  extension?: number;
  imp?: number;
  consultation?: number;
}

export interface TeachingLoadDesignationInput {
  id?: string;
  name: string;
  hours: number;
  service_credit: number;
  grants_service_credit: boolean;
  plotted_hours?: number;
  valid_session?: boolean;
}

export interface TeachingLoadInput {
  assignments?: TeachingLoadAssignmentInput[];
  otherFunctions?: TeachingLoadOtherFunctions;
  designations?: TeachingLoadDesignationInput[];
  overload_plotted_hours?: number;
  functionPlottedHours?: TeachingLoadOtherFunctions;
  functionValidSessions?: Partial<Record<keyof TeachingLoadOtherFunctions, boolean>>;
  students?: { section_id: string; section_name: string; student_count: number | null }[];
}

export interface TeachingLoadOutput {
  lecture_hours: number;
  lab_hours: number;
  weighted_lab_hours: number;
  teaching_hours: number;
  preps: number;
  prep_breakdown: { subject_id: string; subject_code?:string; component: 'LEC' | 'LAB' }[];
  prep_ceiling: number;
  prep_ceiling_source: 'NONE' | 'TIER' | 'EXTRAPOLATED';
  teaching_overload: number;
  claimable_overload_hours: number;
  teaching_service_credit: number;
  overload_plotted_hours: number;
  overload_remaining_to_plot: number;
  claim_session_hours: number;
  regular_teaching_hours: number;
  designation_hours: number;
  total_faculty_time: number;
  remaining_to_target: number;
  service_credits: number;
  functions: Record<keyof TeachingLoadOtherFunctions, { declared: number; plotted: number; counted: number }>;
  designations: (TeachingLoadDesignationInput & { accepted: boolean; counted_hours: number })[];
  students_by_section: { section_id: string; section_name: string; student_count: number | null }[];
  total_students: number;
  weekly_hours: number;
  effectivity: { start: string | null; end: string | null; source: 'TERM' | 'FACULTY' };
  sessions: { id: string; type: string; day_of_week: string; start_time: string; end_time: string; faculty_designation_id: string | null }[];
  warnings: string[];
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Round to 2 decimals — applied to every numeric output. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clamp0(value: number): number {
  return Math.max(0, value);
}


/* -------------------------------------------------------------------------- */
/* Pure engine — no database access                                           */
/* -------------------------------------------------------------------------- */

/**
 * Calculate a faculty member's teaching load from raw inputs.
 *
 * Pure: accepts plain data, returns plain data, touches no database. All
 * callers (Bite 1 loader, future Bite 2 UI, tests) share the same numbers.
 *
 * Assumptions (documented for the Chairman):
 *   - Labs only earn `labCoefficient` of their hours toward teaching load.
 *   - Preps count distinct subjects, not sections; a subject with both lec
 *     and lab counts as 2 preps.
 *   - The 40-hour weekly target counts REGULAR teaching only — overload is
 *     not part of the 40.
 *   - Preps above the highest tier extrapolate the highest ceiling.
 */
export function calculateTeachingLoad(
  input: TeachingLoadInput,
  config: TeachingLoadConfig = DEFAULT_LOAD_CONFIG,
): TeachingLoadOutput {
  const assignments = input.assignments ?? [];
  const otherFunctions = input.otherFunctions ?? {};
  const designations = input.designations ?? [];
  const overloadPlotted = input.overload_plotted_hours ?? 0;

  const research = otherFunctions.research ?? 0;
  const extension = otherFunctions.extension ?? 0;
  const imp = otherFunctions.imp ?? 0;
  const consultation = otherFunctions.consultation ?? 0;

  const warnings: string[] = [];
  const functions = {} as TeachingLoadOutput['functions'];
  for (const key of ['research', 'extension', 'imp', 'consultation'] as const) {
    const declared = round2(otherFunctions[key] ?? 0);
    const plotted = round2(input.functionPlottedHours?.[key] ?? 0);
    const valid = plotted >= config.minDesignationSessionHours && (input.functionValidSessions?.[key] ?? true);
    functions[key] = { declared, plotted, counted: valid ? round2(Math.min(declared, plotted)) : 0 };
    if (declared > 0 && (!valid || plotted < declared)) warnings.push(`${key}: ${declared} declared, ${plotted} plotted; ${functions[key].counted} counted. Valid sessions are required.`);
  }
  const acceptedDesignations = designations.map((d) => {
    const plotted = round2(d.plotted_hours ?? 0);
    const accepted = plotted >= config.minDesignationSessionHours && (d.valid_session ?? true);
    if (!accepted) warnings.push(`${d.name}: designation not accepted; a session of at least ${config.minDesignationSessionHours} hour(s) is required.`);
    return { ...d, hours: round2(d.hours), service_credit: round2(d.service_credit), plotted_hours: plotted, accepted, counted_hours: accepted ? round2(Math.min(d.hours, plotted)) : 0 };
  });

  // 1. lecture_hours / lab_hours — every section counts separately.
  const lecture_hours = round2(
    assignments.reduce((sum, a) => sum + (a.lecture_hours ?? 0), 0),
  );
  const lab_hours = round2(
    assignments.reduce((sum, a) => sum + (a.lab_hours ?? 0), 0),
  );

  // 2. weighted lab + total teaching hours.
  const weighted_lab_hours = round2(lab_hours * config.labCoefficient);
  const teaching_hours = round2(lecture_hours + weighted_lab_hours);

  // 3. preps = distinct subjects with lec > 0 + distinct subjects with lab > 0.
  const lecSubjects = new Set(
    assignments.filter((a) => (a.lecture_hours ?? 0) > 0).map((a) => a.subject_id),
  );
  const labSubjects = new Set(
    assignments.filter((a) => (a.lab_hours ?? 0) > 0).map((a) => a.subject_id),
  );
  const preps = lecSubjects.size + labSubjects.size;
  const prep_breakdown: TeachingLoadOutput['prep_breakdown'] = [
    ...[...lecSubjects].sort().map((subject_id) => ({ subject_id, component: 'LEC' as const })),
    ...[...labSubjects].sort().map((subject_id) => ({ subject_id, component: 'LAB' as const })),
  ];

  // 4. prep ceiling from the tier table.
  let prep_ceiling: number;
  let prep_ceiling_source: 'NONE' | 'TIER' | 'EXTRAPOLATED';
  const highestTier = config.prepTiers[config.prepTiers.length - 1];
  if (preps === 0) {
    prep_ceiling = 0;
    prep_ceiling_source = 'NONE';
  } else {
    const tier = config.prepTiers.find(
      (t) => preps >= t.minPreps && preps <= t.maxPreps,
    );
    if (tier) {
      prep_ceiling = tier.ceiling;
      prep_ceiling_source = 'TIER';
    } else {
      prep_ceiling = highestTier.ceiling;
      prep_ceiling_source = 'EXTRAPOLATED';
      warnings.push(
        `Preps ${preps} exceed the highest configured tier (${
          highestTier.maxPreps
        }); ceiling extrapolated at ${highestTier.ceiling}.`,
      );
    }
  }

  // 5. Teaching overload — rounded to 2 decimals FIRST.
  const teaching_overload = round2(clamp0(teaching_hours - prep_ceiling));

  // 6. Claimable (whole hours) + fractional service credit.
  const claimable_overload_hours = Math.floor(teaching_overload);
  const teaching_service_credit = round2(
    teaching_overload - claimable_overload_hours,
  );

  // 7. Overload plotting.
  const overload_remaining_to_plot = round2(
    clamp0(claimable_overload_hours - overloadPlotted),
  );
  const claim_session_hours = round2(
    Math.min(overloadPlotted, claimable_overload_hours),
  );
  if (overloadPlotted > claimable_overload_hours) {
    warnings.push(
      `Plotted overload ${overloadPlotted} exceeds claimable ${claimable_overload_hours}; only ${claimable_overload_hours} claimable.`,
    );
  }

  // 8. Regular teaching = min(teaching, ceiling). Overload is NOT part of the
  //    40-hour weekly target (documented assumption above).
  const regular_teaching_hours = round2(Math.min(teaching_hours, prep_ceiling));

  // 9. Designation hours + total faculty time vs the weekly target.
  const designation_hours = round2(
    acceptedDesignations.reduce((sum, d) => sum + d.counted_hours, 0),
  );
  const total_faculty_time = round2(
    regular_teaching_hours +
      functions.research.counted +
      functions.extension.counted +
      functions.imp.counted +
      functions.consultation.counted +
      designation_hours,
  );
  const remaining_to_target = round2(config.facultyWeeklyHours - total_faculty_time);
  if (total_faculty_time > config.facultyWeeklyHours) {
    warnings.push(
      `Total faculty time ${total_faculty_time} exceeds the ${config.facultyWeeklyHours}-hour weekly target by ${round2(
        total_faculty_time - config.facultyWeeklyHours,
      )}.`,
    );
  }

  // 10. Service credits (grants only) — NOT counted in the 40.
  const service_credits = round2(
    acceptedDesignations
      .filter((d) => d.accepted && d.grants_service_credit === true && !/\b(chair|chairman|dean)\b/i.test(d.name))
      .reduce((sum, d) => sum + (d.service_credit ?? 0), 0),
  );

  // 11. Function minimum warnings (imp min is 0 → never warns).
  if (research < config.minFunctionHours.research) {
    warnings.push(
      `Research ${research} is below the minimum ${config.minFunctionHours.research} hour(s).`,
    );
  }
  if (extension < config.minFunctionHours.extension) {
    warnings.push(
      `Extension ${extension} is below the minimum ${config.minFunctionHours.extension} hour(s).`,
    );
  }
  if(imp<config.minFunctionHours.imp)warnings.push(`IMP ${imp} is below the minimum ${config.minFunctionHours.imp} hour(s).`);
  if (consultation !== config.consultationHours) {
    warnings.push(
      `Consultation ${consultation} differs from the configured ${config.consultationHours} hour(s).`,
    );
  }

  return {
    lecture_hours,
    lab_hours,
    weighted_lab_hours,
    teaching_hours,
    preps,
    prep_breakdown,
    prep_ceiling,
    prep_ceiling_source,
    teaching_overload,
    claimable_overload_hours,
    teaching_service_credit,
    overload_plotted_hours: round2(overloadPlotted),
    overload_remaining_to_plot,
    claim_session_hours,
    regular_teaching_hours,
    designation_hours,
    total_faculty_time,
    remaining_to_target,
    service_credits,
    functions,
    designations: acceptedDesignations,
    students_by_section: [...new Map((input.students ?? []).map((s) => [s.section_id, s])).values()],
    total_students: round2([...new Map((input.students ?? []).map((s) => [s.section_id, s])).values()].reduce((sum, s) => sum + (s.student_count ?? 0), 0)),
    weekly_hours: round2(config.facultyWeeklyHours),
    effectivity: {start:null,end:null,source:'TERM'},
    sessions: [],
    warnings,
  };
}

/* -------------------------------------------------------------------------- */
/* Read loader — delegates all derived values to the existing pure engine     */
/* -------------------------------------------------------------------------- */

/**
 * Load a faculty's non-deleted WorkloadAssignments for a term, map each to its
 * Subject's lecture/lab hours, and hand the result to the pure engine.
 *
 * Function declarations, valid sessions, active designations and distinct
 * section counts are fetched on read. Derived values are never persisted.
 */
export async function getFacultyTeachingLoad(
  facultyId: string,
  termId: string,
  sessionOverride?: TeachingLoadOutput['sessions'],
): Promise<TeachingLoadOutput> {
  const [rows, designationRows] = await Promise.all([
    prisma.workloadAssignment.findMany({
      where: {
        faculty_id: facultyId,
        term_id: termId,
        deleted_at: null,
      },
      select: {
        subject_id: true,
        subject: {
          select: {
            code: true,
            lecture_hours: true,
            lab_hours: true,
          },
        },
      },
    }),
    prisma.facultyDesignation.findMany({
      where: {
        faculty_id: facultyId,
        term_id: termId,
        deleted_at: null,
        designation: {deleted_at:null},
      },
      include: {
        designation: true,
      },
    }),
  ]);

  const [functions,storedSessions,term,handled,students,config]=await Promise.all([
    programRepository.getFacultyLoad(facultyId,termId),sessionOverride ? Promise.resolve([]) : programRepository.listSessions(facultyId,termId),
    prisma.academicTerm.findUnique({where:{id:termId}}),programRepository.getHandledSections(facultyId,termId),programRepository.getStudents(facultyId,termId),getLoadConfig(),
  ]);
  const sessions=sessionOverride??storedSessions;
  if(!term) throw new Error('Term not found');
  const hours=(s:{start_time:string;end_time:string})=>round2((Number(s.end_time.slice(0,2))*60+Number(s.end_time.slice(3,5))-Number(s.start_time.slice(0,2))*60-Number(s.start_time.slice(3,5)))/60);
  const sumHours=(type:string,id?:string)=>round2(sessions.filter(s=>s.type===type && (!id || s.faculty_designation_id===id) && hours(s)>=config.minDesignationSessionHours && (type!=='OVERLOAD'||Number.isInteger(hours(s)))).reduce((sum,s)=>sum+hours(s),0));
  const plottedFunctions={research:sumHours('RESEARCH'),extension:sumHours('EXTENSION'),imp:sumHours('IMP'),consultation:sumHours('CONSULTATION')};
  const consultationTarget=functions?.consultation_hours??config.consultationHours;
  const declaredFunctions={
    research:functions?.research_hours??config.minFunctionHours.research,
    extension:functions?.extension_hours??config.minFunctionHours.extension,
    imp:functions?.imp_hours??config.minFunctionHours.imp,
    consultation:consultationTarget,
  };
  const countMap=new Map(students.map(s=>[s.section_id,s.student_count]));
  const input: TeachingLoadInput = {
    assignments: rows.map((row) => ({
      subject_id: row.subject_id,
      lecture_hours: row.subject.lecture_hours ?? 0,
      lab_hours: row.subject.lab_hours ?? 0,
    })),
    // Declared hours remain visible; only valid plotted hours count toward the
    // total, capped by the corresponding declaration.
    otherFunctions: declaredFunctions,
    functionPlottedHours:plottedFunctions,
    students:handled.map(({section})=>({section_id:section.id,section_name:`${section.name} (Year ${section.year_level})`,student_count:countMap.get(section.id)??null})),
    designations: designationRows.map((row) => ({
      id: row.id,
      name: row.designation.name,
      hours: row.hours,
      service_credit: row.service_credit,
      grants_service_credit: row.designation.grants_service_credit,
      plotted_hours:sumHours('DESIGNATION',row.id),
    })),
    overload_plotted_hours: sumHours('OVERLOAD'),
  };

  const result=calculateTeachingLoad(input,{...config,consultationHours:consultationTarget});
  result.prep_breakdown=result.prep_breakdown.map(p=>({...p,subject_code:rows.find(r=>r.subject_id===p.subject_id)?.subject.code}));
  result.effectivity={start:term.effectivity_start,end:term.effectivity_end,source:'TERM'};
  result.sessions=sessions;
  if(result.students_by_section.some(s=>s.student_count===null)) result.warnings.push('Student counts are missing for one or more handled sections.');
  if(!result.effectivity.start) result.warnings.push('Term effectivity dates have not been configured.');
  return result;
}
