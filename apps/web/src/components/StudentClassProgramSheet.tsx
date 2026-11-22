import type { CSSProperties } from 'react';
import { apiAssetUrl } from '../lib/api';
import type { ProgramForm } from '../lib/program-forms';

const days = ['MON','TUE','WED','THU','FRI','SAT'];
const names = ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
const minutes = (time: string) => Number(time.slice(0,2))*60+Number(time.slice(3,5));
const hour = (time: number) => `${String(Math.floor(time/60)%12||12).padStart(2,'0')}:${String(time%60).padStart(2,'0')}`;

/** A section program reads the same saved slots as the Chairman's schedule. */
export function StudentClassProgramSheet({ form, preparedBy, preparedTitle }: { form: ProgramForm; preparedBy: string; preparedTitle?: string }): JSX.Element {
  const start = Math.floor(Math.min(450,...form.slots.map(slot=>minutes(slot.start_time)))/30)*30;
  const end = Math.ceil(Math.max(1140,...form.slots.map(slot=>minutes(slot.end_time)))/30)*30;
  const periods = Array.from({length:(end-start)/30},(_,index)=>start+index*30);
  const hasLunchClass = form.slots.some(slot=>minutes(slot.start_time)<780&&minutes(slot.end_time)>720);
  const matching = (day:string,time:number) => form.slots.filter(slot=>slot.day_of_week===day&&minutes(slot.start_time)<time+30&&minutes(slot.end_time)>time);
  const signature = form.signatures.find(item=>item.slot==='PREPARED');
  const widthPoints=(4+8+2.5+8+6*16)*7*.75+10*5*.75;
  const ratio=(11.69-.6)/(8.27-.5);
  const rowHeight=(widthPoints*ratio-(4*21+3*22+24+4*18))/periods.length;
  return <article className="student-program-sheet" style={{'--student-row-height':`${rowHeight*(7.77*96/widthPoints)}px`} as CSSProperties}>
    <table className="student-program-header"><colgroup><col style={{width:'15%'}}/><col style={{width:'49%'}}/><col style={{width:'36%'}}/></colgroup><tbody>
      <tr><td rowSpan={2} className="student-school-logo"><img src={apiAssetUrl(form.settings.school_logo_path??'/school-logo.jpg')??''} alt="PIT logo"/></td><th rowSpan={2} className="student-institution">{form.settings.school_lines.split('\n').map((line,index)=><div key={index}>{line}</div>)}</th><th className="student-program-title">STUDENT CLASS PROGRAM</th></tr>
      <tr><th className="student-term">{form.term.label}</th></tr>
      <tr><td>College:</td><td className="student-field-value">{form.settings.college_lines}</td><td><span>Program:</span> <b>{form.settings.program}</b></td></tr>
      <tr><td>Department:</td><td className="student-field-value">{form.settings.department}</td><td><span>Major:</span> <b></b></td></tr>
      <tr><td colSpan={2} className="student-header-spacer"/><td><span>Yr/Sec:</span> <b>{form.entity.name}</b></td></tr>
    </tbody></table>
    <table className="student-program-grid"><colgroup><col style={{width:'4%'}}/><col style={{width:'8.5%'}}/><col style={{width:'3%'}}/><col style={{width:'8.5%'}}/>{days.map(day=><col key={day} style={{width:`${76/6}%`}}/>)}</colgroup><thead><tr><th colSpan={4}>TIME</th>{names.map(day=><th key={day}>{day}</th>)}</tr></thead><tbody>
      {periods.map((time,index)=><tr key={time}>
        {(index===0||time===720)&&<th className="student-meridiem" rowSpan={periods.filter(value=>(value<720)===(time<720)).length}>{time<720?<>A.<br/>M.</>:<>P.<br/>M.</>}</th>}
        <td className="student-time">{hour(time)}</td><td>-</td><td className="student-time">{hour(time+30)}</td>
        {!hasLunchClass&&time===720?<td colSpan={6} rowSpan={2} className="student-noon-break">N O O N&nbsp; B R E A K</td>:!hasLunchClass&&time===750?null:days.map(day=>{
          const slots=matching(day,time), key=slots.map(slot=>slot.id).join('|');
          if(index>0&&key&&matching(day,time-30).map(slot=>slot.id).join('|')===key)return null;
          let length=1;
          if(key)while(index+length<periods.length&&matching(day,time+length*30).map(slot=>slot.id).join('|')===key)length++;
          const color=slots.length>1?'#fecaca':slots[0]?.color??'#fff';
          return <td key={day} rowSpan={length} className={slots.length?'student-class-cell':''} style={{background:color,color:'#000'}}>{slots.map(slot=><div key={slot.id}><strong>{slot.subject_code}{slot.session_type==='LAB'?' L':''}</strong><br/>{slot.faculty_name}<br/>{slot.room_name??'TBA'}</div>)}</td>;
        })}
      </tr>)}
    </tbody></table>
    <div className="student-program-signature"><span>Prepared by:</span><div><strong>{preparedBy}</strong>{(preparedTitle??signature?.title)&&<p>{preparedTitle??signature?.title}</p>}</div></div>
  </article>;
}
