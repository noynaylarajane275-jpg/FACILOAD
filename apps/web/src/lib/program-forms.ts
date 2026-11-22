import { apiFetch } from './api';
import type { TeachingLoad } from './teaching-load';
import type { ScheduleSlot } from './schedule-slots';
export interface FormSettings {school_lines:string;college_lines:string;department:string;program:string;major?:string;school_logo_path:string|null;tuv_logo_path:string|null}
export interface FormTemplate {type:string;title:string;ref_code:string;revision:string}
export interface Signatory {id:string;slot:'PREPARED'|'REVIEWED'|'VERIFIED'|'APPROVED';name:string;title:string;active:boolean}
export interface FormConfiguration {settings:FormSettings;templates:FormTemplate[];signatories:Signatory[]}
export interface ProgramForm {
  kind:'faculty'|'sections'|'rooms';entity:{id:string;name:string;rank:string|null};term:{id:string;label:string};settings:FormSettings;template:FormTemplate;
  signatory_options:Signatory[];signatures:{slot:Signatory['slot'];name:string;title:string;option_id:string|null}[];
  effectivity:{start:string|null;end:string|null;source:string};slots:ScheduleSlot[];load:TeachingLoad|null;
  assignments?:{id:string;subject_id:string;subject_code:string;section_id:string;section_label:string;lecture_hours:number;lab_hours:number}[];
}
export const getFormConfiguration=()=>apiFetch<FormConfiguration>('/api/form-settings');
export const getProgramForm=(kind:string,id:string,query:URLSearchParams)=>apiFetch<ProgramForm>(`/api/forms/${kind}/${id}?${query}`);
