import { apiFetch } from './api';
export type FunctionType='RESEARCH'|'EXTENSION'|'IMP'|'CONSULTATION'|'DESIGNATION'|'OVERLOAD';
export interface FacultySession {id:string;type:FunctionType;day_of_week:string;start_time:string;end_time:string;faculty_designation_id:string|null}
export interface LoadDesignation {id:string;name:string;hours:number;service_credit:number;grants_service_credit:boolean;plotted_hours:number;accepted:boolean;counted_hours:number}
export interface TeachingLoad {
  lecture_hours:number;lab_hours:number;weighted_lab_hours:number;teaching_hours:number;preps:number;
  prep_breakdown:{subject_id:string;subject_code?:string;component:'LEC'|'LAB'}[];prep_ceiling:number;prep_ceiling_source:string;
  teaching_overload:number;claimable_overload_hours:number;teaching_service_credit:number;overload_plotted_hours:number;
  claim_session_hours:number;overload_remaining_to_plot:number;regular_teaching_hours:number;designation_hours:number;
  total_faculty_time:number;remaining_to_target:number;service_credits:number;weekly_hours:number;
  functions:Record<'research'|'extension'|'imp'|'consultation',{declared:number;plotted:number;counted:number}>;
  designations:LoadDesignation[];sessions:FacultySession[];
  students_by_section:{section_id:string;section_name:string;student_count:number|null}[];total_students:number;
  effectivity:{start:string|null;end:string|null;source:string};warnings:string[];
}
export interface LoadSettings {lab_coefficient:number;weekly_hours:number;consultation_hours:number;min_research:number;min_extension:number;min_imp:number;min_session_hours:number;prep_tiers:{minPreps:number;maxPreps:number;ceiling:number}[]}
export interface Designation {id:string;name:string;default_hours:number;service_credit_hours:number;grants_service_credit:boolean}
export const getTeachingLoad=(id:string,termId:string)=>apiFetch<{faculty:{id:string;first_name:string;last_name:string};load:TeachingLoad}>(`/api/faculty/${id}/teaching-load?termId=${termId}`);
export const getLoadSettings=()=>apiFetch<{settings:LoadSettings}>('/api/load-settings');
export const getDesignations=()=>apiFetch<{data:Designation[]}>('/api/designations?pageSize=100');
export const sessionDuration=(s:{start_time:string;end_time:string})=>(Number(s.end_time.slice(0,2))*60+Number(s.end_time.slice(3))-Number(s.start_time.slice(0,2))*60-Number(s.start_time.slice(3)))/60;
