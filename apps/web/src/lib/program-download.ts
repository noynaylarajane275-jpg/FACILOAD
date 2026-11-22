import { apiFetch } from './api';
import { downloadWorkbook,exportFileName } from './schedule-export';
export async function downloadProgramWorkbook(kind:'faculty'|'sections'|'rooms',id:string,termId:string,name:string,signatures:Record<string,string>={}){
  const query=new URLSearchParams({termId,...signatures});
  if(kind==='sections'){
    const {getProgramForm}=await import('./program-forms');
    const {buildSectionScheduleWorkbook}=await import('./section-schedule-export');
    const form=await getProgramForm(kind,id,query);
    downloadWorkbook(await buildSectionScheduleWorkbook(form),exportFileName(name,form.term.label));
    return;
  }
  const blob=await apiFetch<Blob>(`/api/exports/${kind}/${id}?${query}`,{responseType:'blob'});
  downloadWorkbook(new Uint8Array(await blob.arrayBuffer()),exportFileName(name));
}
