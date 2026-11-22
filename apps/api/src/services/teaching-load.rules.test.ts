import { describe, it, expect } from 'vitest';
import { calculateTeachingLoad as calculate, round2 } from './teaching-load.service.js';
import { loadSettingsSchema } from '../validation/load-settings.validation.js';
const reyes = [
  ...Array.from({length:2},()=>({subject_id:'IE322',lecture_hours:3,lab_hours:3})),
  ...Array.from({length:3},()=>({subject_id:'IE105',lecture_hours:3,lab_hours:0})),
];
describe('Chairman teaching-load rules',()=>{
  it('F1: sums sections and counts distinct subject/component preparations',()=>{
    const r=calculate({assignments:reyes});
    expect([r.lecture_hours,r.lab_hours,r.weighted_lab_hours,r.teaching_hours,r.preps,r.prep_ceiling,r.teaching_overload,r.claimable_overload_hours,r.teaching_service_credit]).toEqual([15,6,4.2,19.2,3,18,1.2,1,.2]);
    expect(r.prep_breakdown).toHaveLength(3);
  });
  it('F4: fully plotted functions and designation plus regular teaching total 40',()=>{
    const functions={research:6,extension:4,imp:2,consultation:4};
    const r=calculate({assignments:reyes,otherFunctions:functions,functionPlottedHours:functions,designations:[{name:'Coordinator',hours:6,plotted_hours:6,service_credit:2,grants_service_credit:true}],overload_plotted_hours:1});
    expect([r.total_faculty_time,r.remaining_to_target,r.service_credits,r.claim_session_hours]).toEqual([40,0,2,1]);
  });
  it('F5: half-hour designation earns neither hours nor credit',()=>{
    const r=calculate({designations:[{name:'Coordinator',hours:6,plotted_hours:.5,service_credit:3,grants_service_credit:true}]});
    expect([r.designation_hours,r.service_credits]).toEqual([0,0]);
    expect(r.designations[0].accepted).toBe(false);
    expect(r.warnings.some(w=>w.includes('not accepted'))).toBe(true);
    expect(calculate({designations:[{name:'Coordinator',hours:6,plotted_hours:.5,valid_session:true,service_credit:3,grants_service_credit:true}]}).designation_hours).toBe(0);
  });
  it('counts minimum declared/plotted; missing or short sessions count zero',()=>{
    const r=calculate({otherFunctions:{research:6,extension:4,imp:2,consultation:4},functionPlottedHours:{research:2,extension:5,imp:.5,consultation:4}});
    expect(r.functions.research.counted).toBe(2); expect(r.functions.extension.counted).toBe(4); expect(r.functions.imp.counted).toBe(0);
    expect(calculate({otherFunctions:{research:6}}).functions.research.counted).toBe(0);
  });
  it('F9: counts distinct sections once; floating point lab 6 × 0.7 is 4.2',()=>{
    const r=calculate({students:[{section_id:'a',section_name:'A',student_count:30},{section_id:'a',section_name:'A',student_count:30},{section_id:'b',section_name:'B',student_count:20}]});
    expect(r.total_students).toBe(50); expect(r.students_by_section).toHaveLength(2); expect(round2(6*.7)).toBe(4.2);
  });
  it('never grants Chair or Dean designation credits',()=>{
    for(const name of ['Department Chair','Dean']) expect(calculate({designations:[{name,hours:6,plotted_hours:6,service_credit:3,grants_service_credit:true}]}).service_credits).toBe(0);
  });
  it('rejects empty, overlapping and gapped prep tier settings',()=>{
    const base={lab_coefficient:.7,weekly_hours:40,consultation_hours:4,min_research:1,min_extension:1,min_imp:0,min_session_hours:1};
    for(const prep_tiers of [[],[{minPreps:2,maxPreps:3,ceiling:18}],[{minPreps:1,maxPreps:2,ceiling:21},{minPreps:2,maxPreps:4,ceiling:18}]]) expect(loadSettingsSchema.safeParse({...base,prep_tiers}).success).toBe(false);
  });
});
