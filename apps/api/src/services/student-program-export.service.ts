import ExcelJS from 'exceljs';
import type { getProgramForm } from './program-form.service.js';

type Program = Awaited<ReturnType<typeof getProgramForm>>;
const days=['MON','TUE','WED','THU','FRI','SAT'];
const names=['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
const minutes=(value:string)=>Number(value.slice(0,2))*60+Number(value.slice(3,5));
const hour=(value:number)=>`${Math.floor(value/60)%12||12}:${String(value%60).padStart(2,'0')}`;

export async function buildStudentProgramWorkbook(form:Program, addLogo:(workbook:ExcelJS.Workbook,sheet:ExcelJS.Worksheet)=>Promise<void>) {
  const wb=new ExcelJS.Workbook();wb.creator='FACILOAD';
  const sheet=wb.addWorksheet('Student Class Program',{views:[{showGridLines:false}]});
  sheet.columns=[{width:5},{width:9},{width:3},{width:9},...days.map(()=>({width:18}))];
  const merge=(range:string,value:string,bold=false,size=10)=>{sheet.mergeCells(range);const cell=sheet.getCell(range.split(':')[0]);cell.value=value;cell.font={name:'Arial',size,bold};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};};
  for(let row=1;row<=8;row++)sheet.getRow(row).height=20;
  merge('A1:B4','');merge('C1:G4',form.settings.school_lines,true,12);
  merge('H1:J2','STUDENT CLASS PROGRAM',true,14);merge('H3:J4',form.term.label,true,12);
  merge('A5:B5','College:');merge('C5:G5',form.settings.college_lines);
  sheet.getCell('H5').value='Program:';merge('I5:J5',form.settings.program,true);
  merge('A6:B6','Department:');merge('C6:G6',form.settings.department);
  sheet.getCell('H6').value='Major:';merge('I6:J6',form.settings.major,true);
  merge('A7:G7','');sheet.getCell('H7').value='Yr/Sec:';merge('I7:J7',form.entity.name.replace(/\s*\(Year\s+\d+\)\s*$/i,''),true);
  merge('A8:D8','TIME',true);names.forEach((name,index)=>sheet.getCell(8,index+5).value=name);
  await addLogo(wb,sheet);
  const slots=form.slots.filter(slot=>days.includes(slot.day_of_week));
  const start=Math.floor(Math.min(450,...slots.map(slot=>minutes(slot.start_time)))/30)*30;
  const end=Math.ceil(Math.max(1140,...slots.map(slot=>minutes(slot.end_time)))/30)*30;
  const count=(end-start)/30,first=9,last=first+count-1;
  const lunchOccupied=slots.some(slot=>minutes(slot.start_time)<780&&minutes(slot.end_time)>720);
  for(let i=0;i<count;i++){const row=first+i;sheet.getRow(row).height=21;sheet.getCell(row,2).value=hour(start+i*30);sheet.getCell(row,3).value='-';sheet.getCell(row,4).value=hour(start+(i+1)*30);}
  for(const morning of [true,false]){const indices=Array.from({length:count},(_,i)=>i).filter(i=>(start+i*30<720)===morning);if(indices.length)merge(`A${first+indices[0]}:A${first+indices.at(-1)!}`,morning?'A.\nM.':'P.\nM.',true);}
  if(!lunchOccupied)merge(`E${first+(720-start)/30}:J${first+(780-start)/30-1}`,'N O O N  B R E A K',true,13);
  for(const [dayIndex,day] of days.entries()){
    const matching=(time:number)=>slots.filter(slot=>slot.day_of_week===day&&minutes(slot.start_time)<time+30&&minutes(slot.end_time)>time);
    let index=0;
    while(index<count){const matches=matching(start+index*30);if(!matches.length){index++;continue;}
      const key=matches.map(slot=>slot.id).join('|');let next=index+1;
      while(next<count&&matching(start+next*30).map(slot=>slot.id).join('|')===key)next++;
      const top=first+index,bottom=first+next-1,col=dayIndex+5;
      if(bottom>top)sheet.mergeCells(top,col,bottom,col);
      const cell=sheet.getCell(top,col);cell.value=matches.map(slot=>`${slot.subject_code} (${slot.session_type==='LAB'?'Lab':'Lec'})\n${slot.faculty_name}\n${slot.room_name??'TBA'}`).join('\n\n');
      const hex=matches.length>1?'FECACA':matches[0].color?.replace('#','')??'FFFFFF';
      cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:`FF${/^[a-f\d]{6}$/i.test(hex)?hex:'FFFFFF'}`}};
      index=next;
    }
  }
  const footer=last+2,prepared=form.signatures.find(sig=>sig.slot==='PREPARED');
  merge(`A${last+1}:J${last+1}`,'');merge(`A${footer}:J${footer}`,'Prepared by:');sheet.getCell(footer,1).alignment={horizontal:'left',vertical:'top'};
  merge(`A${footer+1}:J${footer+2}`,'');merge(`B${footer+3}:F${footer+3}`,prepared?.name??'',true,11);merge(`B${footer+4}:F${footer+4}`,prepared?.title??'');
  const border={style:'thin' as const,color:{argb:'FF111111'}};
  for(let row=1;row<=footer+4;row++)for(let col=1;col<=10;col++){
    const cell=sheet.getCell(row,col);if(row< footer)cell.border={top:border,bottom:border,left:border,right:border};
    if(!cell.font?.name)cell.font={name:'Arial',size:row>=first?9:10};
    cell.alignment={horizontal:'center',vertical:'middle',wrapText:true,...cell.alignment};
    if(row===8){cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFA9D18E'}};cell.font={name:'Arial',size:10,bold:true};}
  }
  sheet.getCell(`B${footer+3}`).font={name:'Arial',size:11,bold:true,underline:true};
  sheet.getCell('I6').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFA9D18E'}};
  for(let row=footer;row<=footer+4;row++)for(let col=1;col<=10;col++){
    const cell=sheet.getCell(row,col);cell.border={...(row===footer?{top:border}:{}),...(row===footer+4?{bottom:border}:{}),...(col===1?{left:border}:{}),...(col===10?{right:border}:{})};
  }
  sheet.pageSetup={orientation:'portrait',paperSize:1 as ExcelJS.PaperSize,fitToPage:true,fitToWidth:1,fitToHeight:1,horizontalCentered:true,printArea:`A1:J${footer+4}`,margins:{left:.25,right:.25,top:.25,bottom:.25,header:0,footer:0}};
  return Buffer.from(await wb.xlsx.writeBuffer());
}
