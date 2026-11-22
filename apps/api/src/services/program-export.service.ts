import ExcelJS from 'exceljs';
import { buildStudentProgramWorkbook } from './student-program-export.service.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ApiError } from '../errors/apiError.js';
import { prisma } from '../config/prisma.js';
import { formLogoDir } from './form.service.js';
import { getProgramForm } from './program-form.service.js';
import { getLoadConfig } from './load-settings.service.js';
import { round2 } from './teaching-load.service.js';
type Program=Awaited<ReturnType<typeof getProgramForm>>;
const DAYS=['MON','TUE','WED','THU','FRI'];
const FUNCTION_COLORS:Record<string,string>={RESEARCH:'D1FAE5',EXTENSION:'DBEAFE',IMP:'EDE9FE',CONSULTATION:'FEF3C7',DESIGNATION:'FCE7F3',OVERLOAD:'FFEDD5'};
const thin={style:'thin' as const,color:{argb:'FF000000'}};
const edge={top:thin,bottom:thin,left:thin,right:thin};
const minutes=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3,5));
const clock=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const formula=(s:ExcelJS.Worksheet,address:string,text:string,result:number|string)=>{s.getCell(address).value={formula:text,result};s.getCell(address).numFmt=typeof result==='number'?'0.00':'General';};
async function readPublicAsset(name:string){
  for(const candidate of [path.resolve(process.cwd(),'../web/public',name),path.resolve(process.cwd(),'apps/web/public',name)]){
    try{return await fs.readFile(candidate);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  }
  return null;
}
function addImage(wb:ExcelJS.Workbook,s:ExcelJS.Worksheet,bytes:Buffer,extension:'png'|'jpeg',col:number,row:number,width:number,height:number){
  const id=wb.addImage({buffer:bytes as never,extension});
  const nativeCol=Math.floor(col),nativeRow=Math.floor(row);
  const columnPixels=Math.floor((s.getColumn(nativeCol+1).width??8.43)*7+5);
  const rowPixels=(s.getRow(nativeRow+1).height??15)*4/3;
  s.addImage(id,{tl:{nativeCol,nativeRow,nativeColOff:Math.round((col-nativeCol)*columnPixels*9525),nativeRowOff:Math.round((row-nativeRow)*rowPixels*9525)} as ExcelJS.Anchor,ext:{width,height},editAs:'oneCell'});
}
async function addLogo(wb:ExcelJS.Workbook,s:ExcelJS.Worksheet,url:string|null,col:number,width:number,height:number,row=0){
  if(!url)return;
  let bytes:Buffer|undefined;
  if(url==='/school-logo.jpg'){
    bytes=(await readPublicAsset('school-logo.jpg'))??undefined;
  }else if(/^\/uploads\/form-logos\/[a-f0-9-]+\.(png|jpg)$/.test(url)){
    try{bytes=await fs.readFile(path.join(formLogoDir(),path.basename(url)));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  }
  if(!bytes)throw ApiError.badRequest('A configured logo is missing. Upload it again in Form Settings.');
  addImage(wb,s,bytes,url.endsWith('.png')?'png':'jpeg',col,row,width,height);
}
async function addHeader(wb:ExcelJS.Workbook,s:ExcelJS.Worksheet,form:Program){
  s.columns=[{width:18},...Array.from({length:6},()=>({width:20}))];
  for(let r=1;r<=9;r++)s.getRow(r).height=18;
  s.mergeCells('A1:A5');s.mergeCells('F1:G3');
  const lines=form.settings.school_lines.split('\n');
  s.mergeCells('B1:E3');s.getCell('B1').value=form.settings.school_lines;
  for(let r=1;r<=3;r++)s.getRow(r).height=Math.max(18,Math.ceil(lines.length*12/3));
  s.mergeCells('B4:E4');s.getCell('B4').value=form.template.title;s.getCell('B4').font={name:'Arial',size:15,bold:true};
  s.mergeCells('B5:E5');s.getCell('B5').value=form.term.label;
  s.mergeCells('F4:G4');s.getCell('F4').value=`Ref. Code: ${form.template.ref_code}`;
  s.mergeCells('F5:G5');s.getCell('F5').value=`Revision: ${form.template.revision}`;
  s.mergeCells('A7:D7');s.getCell('A7').value=`College: ${form.settings.college_lines}`;
  s.mergeCells('E7:G7');s.getCell('E7').value=`Department: ${form.settings.department}`;
  s.mergeCells('A8:D8');s.getCell('A8').value=`Program: ${form.settings.program}`;
  const entityLine=`${form.kind==='faculty'?'Faculty':form.kind==='sections'?'Section':'Room'}: ${form.entity.name}${form.kind==='sections'?`  |  Number of students: ${form.entity.student_count??'Not entered'}`:''}`;
  s.mergeCells('E8:G8');s.getCell('E8').value=entityLine;
  s.mergeCells('A9:G9');s.getCell('A9').value=`Effectivity: ${form.effectivity.start??'Not set'} to ${form.effectivity.end??'Not set'}${form.entity.rank?`     Academic rank: ${form.entity.rank}`:''}`;
  for(let r=1;r<=9;r++)for(let c=1;c<=7;c++){const cell=s.getCell(r,c);cell.font={name:'Arial',size:r===4&&c>=2&&c<=5?15:10,bold:r===2||r===4};cell.alignment={horizontal:r<=5?'center':'left',vertical:'middle',wrapText:true};}
  s.getRow(7).height=Math.max(30,Math.ceil(form.settings.college_lines.length/70)*12,Math.ceil(form.settings.department.length/55)*12);
  s.getRow(8).height=Math.max(30,Math.ceil(form.settings.program.length/70)*12,Math.ceil(entityLine.length/55)*12);
  s.getRow(4).height=Math.max(24,Math.ceil(form.template.title.length/45)*18);
  await addLogo(wb,s,form.settings.school_logo_path,0,86,86);
  await addLogo(wb,s,form.settings.tuv_logo_path,5,120,48);
}

const cloneValue=<T,>(value:T):T=>value==null?value:JSON.parse(JSON.stringify(value)) as T;
const colNumber=(letters:string)=>[...letters].reduce((value,char)=>value*26+char.charCodeAt(0)-64,0);
const colLetters=(number:number)=>{let value=number,result='';while(value){const remainder=(value-1)%26;result=String.fromCharCode(65+remainder)+result;value=Math.floor((value-1)/26);}return result;};
function mapTemplateRow(row:number,timeBefore:number,timeAfter:number,assignmentExtra:number,designationExtra:number){
  return row+(row>=14?timeBefore:0)+(row>=37?timeAfter:0)+(row>=49?assignmentExtra:0)+(row>=61?designationExtra:0);
}
function prepCeilingFormula(cell:string,tiers:{minPreps:number;maxPreps:number;ceiling:number}[]){
  if(!tiers.length)return '0';
  let formulaText=String(tiers[tiers.length-1].ceiling);
  for(let i=tiers.length-2;i>=0;i--)formulaText=`IF(${cell}<=${tiers[i].maxPreps},${tiers[i].ceiling},${formulaText})`;
  return `IF(${cell}=0,0,${formulaText})`;
}
async function buildFacultyClassProgramWorkbook(form:Program){
  const candidates=[path.resolve(process.cwd(),'../web/public/faculty-class-program-template.xlsx'),path.resolve(process.cwd(),'apps/web/public/faculty-class-program-template.xlsx')];
  let templateBytes:Buffer|undefined;
  for(const candidate of candidates){try{templateBytes=await fs.readFile(candidate);break;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
  if(!templateBytes)throw new Error('The Faculty Class Program Excel template is missing from apps/web/public.');
  const sourceBook=new ExcelJS.Workbook();await sourceBook.xlsx.load(templateBytes as never);
  const template=sourceBook.worksheets[0];
  if(!template)throw new Error('The Faculty Class Program Excel template has no worksheet.');
  const assignments=form.assignments??[],load=form.load,config=await getLoadConfig();
  const blocks=[...form.slots.map(slot=>({day:slot.day_of_week,start:minutes(slot.start_time),end:minutes(slot.end_time),text:`${slot.subject_code}${slot.session_type==='LAB'?' L':''}\n${slot.section_label}\n${form.entity.name}\n${slot.room_name??'TBA'}`,color:slot.color?.replace(/^#/,'').toUpperCase()??'D1FAE5'})),...(load?.sessions??[]).map(session=>({day:session.day_of_week,start:minutes(session.start_time),end:minutes(session.end_time),text:session.type==='DESIGNATION'?(load?.designations.find(d=>d.id===session.faculty_designation_id)?.name??'DESIGNATION'):session.type,color:FUNCTION_COLORS[session.type]}))];
  const start=Math.floor(Math.min(420,...blocks.map(block=>block.start))/30)*30,end=Math.ceil(Math.max(1140,...blocks.map(block=>block.end))/30)*30;
  const timeBefore=(420-start)/30,timeAfter=(end-1140)/30;
  const periods:{start:number;end:number;lunch?:boolean}[]=[];
  for(let time=start;time<720;time+=30)periods.push({start:time,end:time+30});
  periods.push({start:720,end:780,lunch:true});
  for(let time=780;time<end;time+=30)periods.push({start:time,end:time+30});
  const assignmentCount=Math.max(8,assignments.length),assignmentExtra=assignmentCount-8;
  const designationCount=Math.max(2,load?.designations.length??0),designationExtra=designationCount-2;
  const hasSaturday=false;
  const workbook=new ExcelJS.Workbook();workbook.creator='FlowSched';workbook.calcProperties.fullCalcOnLoad=true;
  const sheet=workbook.addWorksheet('Faculty Class Program',{views:[{state:'normal',showGridLines:false}]});
  for(let col=1;col<=6;col++)sheet.getColumn(col).width=template.getColumn(col).width;
  for(let row=1;row<=70;row++){
    const sourceRow=template.getRow(row),targetRow=sheet.getRow(row);
    if(sourceRow.height!=null)targetRow.height=sourceRow.height;
    for(let col=1;col<=6;col++){
      const sourceCell=sourceRow.getCell(col),targetCell=targetRow.getCell(col);
      targetCell.style=cloneValue(sourceCell.style);
      targetCell.value=cloneValue(sourceCell.value);
    }
  }
  if(timeBefore)sheet.spliceRows(14,0,...Array.from({length:timeBefore},()=>Array(6).fill(null)));
  if(timeAfter)sheet.spliceRows(37+timeBefore,0,...Array.from({length:timeAfter},()=>Array(6).fill(null)));
  const timeExtra=timeBefore+timeAfter,assignmentSubtotalBase=49+timeExtra;
  if(assignmentExtra)sheet.spliceRows(assignmentSubtotalBase,0,...Array.from({length:assignmentExtra},()=>Array(6).fill(null)));
  const designationSubtotalBase=61+timeExtra+assignmentExtra;
  if(designationExtra)sheet.spliceRows(designationSubtotalBase,0,...Array.from({length:designationExtra},()=>Array(6).fill(null)));
  const copyInsertedStyle=(fromRow:number,toRow:number)=>{
    const sourceRow=template.getRow(fromRow),targetRow=sheet.getRow(toRow);
    targetRow.height=sourceRow.height;
    for(let col=1;col<=6;col++)targetRow.getCell(col).style=cloneValue(sourceRow.getCell(col).style);
  };
  for(let index=0;index<timeBefore;index++)copyInsertedStyle(14,14+index);
  for(let index=0;index<timeAfter;index++)copyInsertedStyle(36,37+timeBefore+index);
  for(let index=0;index<assignmentExtra;index++)copyInsertedStyle(48,assignmentSubtotalBase+index);
  for(let index=0;index<designationExtra;index++)copyInsertedStyle(60,designationSubtotalBase+index);
  const mapRow=(row:number)=>mapTemplateRow(row,timeBefore,timeAfter,assignmentExtra,designationExtra);
  for(const merge of template.model.merges??[]){
    const match=/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(merge);if(!match)continue;
    const [,firstCol,firstRowText,lastCol,lastRowText]=match,firstRow=Number(firstRowText),lastRow=Number(lastRowText);
    if(firstRow>=14&&lastRow<=36&&colNumber(firstCol)>=2&&colNumber(lastCol)<=6)continue;
    sheet.mergeCells(`${firstCol}${mapRow(firstRow)}:${lastCol}${mapRow(lastRow)}`);
  }
  const scheduleFirstRow=14,scheduleLastRow=scheduleFirstRow+periods.length-1;
  const assignmentStart=41+timeExtra,assignmentEnd=assignmentStart+assignmentCount-1,assignmentSubtotal=assignmentEnd+1;
  const functionHeader=assignmentSubtotal+2,functionStart=functionHeader+1,functionEnd=functionStart+3,functionSubtotal=functionEnd+1;
  const designationHeader=functionSubtotal+2,designationStart=designationHeader+1,designationEnd=designationStart+designationCount-1,designationSubtotal=designationEnd+1;
  const grandTotal=designationSubtotal+2,signatureHeader=grandTotal+2,preparedRow=signatureHeader+1,reviewedRow=signatureHeader+2,verifiedRow=signatureHeader+3,approvedRow=signatureHeader+4,effectivityRow=signatureHeader+5;
  if(hasSaturday){
    sheet.getColumn(7).width=sheet.getColumn(6).width;
    for(let row=13;row<=scheduleLastRow;row++)sheet.getCell(row,7).style=cloneValue(sheet.getCell(row,6).style);
  }else sheet.getColumn(7).hidden=true;
  for(let col=8;col<=13;col++)sheet.getColumn(col).hidden=true;
  for(const merge of ['B24:F24']){try{sheet.unMergeCells(merge);}catch{}}
  sheet.mergeCells(`${colLetters(2)}${scheduleFirstRow+periods.findIndex(period=>period.lunch)}:${colLetters(hasSaturday?7:6)}${scheduleFirstRow+periods.findIndex(period=>period.lunch)}`);

  const lines=form.settings.school_lines.split(/\r?\n/).map(line=>line.trim());
  sheet.getCell('C1').value=lines[0]??'';sheet.getCell('C2').value=lines[1]??'';sheet.getCell('C3').value=lines[2]??'';
  const collegeHeader=sheet.getCell('C5');
  collegeHeader.value=form.settings.college_lines;
  collegeHeader.alignment={...collegeHeader.alignment,horizontal:'center',vertical:'middle',shrinkToFit:true,wrapText:false};
  sheet.getCell('C6').value="INSTRUCTOR'S CLASS PROGRAM";
  sheet.getCell('F1').value=`Ref. Code : ${form.template.ref_code}`;sheet.getCell('F2').value=`Rev. No. : ${form.template.revision}`;
  for(let row=3;row<=7;row++)sheet.getCell(row,6).value=null;
  sheet.getCell('A9').value='Name:';sheet.getCell('B9').value=form.entity.name;sheet.getCell('D9').value='Term:';sheet.getCell('E9').value=form.term.label;
  sheet.getCell('A10').value='Academic Rank:';sheet.getCell('B10').value=form.entity.rank??'';
  sheet.getCell('D10').value='Department:';sheet.getCell('E10').value=form.settings.department;
  sheet.getCell('D11').value='College:';sheet.getCell('E11').value=form.settings.college_lines;
  if(!sheet.model.merges.includes(`A${effectivityRow}:F${effectivityRow}`))sheet.mergeCells(`A${effectivityRow}:F${effectivityRow}`);
  const timeLabel=(value:number)=>`${Math.floor(value/60)%12||12}:${String(value%60).padStart(2,'0')}`;
  const lunchIndex=periods.findIndex(period=>period.lunch),lunchRow=scheduleFirstRow+lunchIndex;
  for(let index=0;index<periods.length;index++){
    const period=periods[index],row=scheduleFirstRow+index;
    sheet.getRow(row).height=Math.max(sheet.getRow(row).height??16.8,16.8);
    const time=sheet.getCell(row,1);time.value=period.lunch?'12:00 - 1:00':`${timeLabel(period.start)} - ${timeLabel(period.end)}`;time.alignment={horizontal:'center',vertical:'middle',wrapText:true};
    for(let col=2;col<=(hasSaturday?7:6);col++){
      const cell=sheet.getCell(row,col);cell.value=null;cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFFFFF'}};cell.border=edge;
      cell.font={...cell.font,name:'Arial',color:{argb:'FF000000'}};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};
    }
  }
  const conflicts=blocks.filter(block=>block.start<780&&block.end>720);
  const lunchCell=sheet.getCell(lunchRow,2);lunchCell.value=conflicts.length?`L  U  N  C  H     B  R  E  A  K\nCONFLICT: ${conflicts.map(block=>`${block.day} ${timeLabel(block.start)}–${timeLabel(block.end)} ${block.text.split('\n')[0]}`).join('; ')}`:'L  U  N  C  H     B  R  E  A  K';
  lunchCell.font={...lunchCell.font,name:'Arial',bold:true,color:{argb:conflicts.length?'FFB91C1C':'FF000000'}};
  lunchCell.fill={type:'pattern',pattern:'solid',fgColor:{argb:conflicts.length?'FFFEE2E2':'FFE7E7E7'}};
  lunchCell.alignment={horizontal:'center',vertical:'middle',wrapText:true};
  sheet.getRow(lunchRow).height=conflicts.length?28:21;
  if(hasSaturday)for(let index=0;index<periods.length;index++)sheet.getCell(scheduleFirstRow+index,7).style=cloneValue(sheet.getCell(scheduleFirstRow+index,6).style);
  const timeLabelRow=13;
  for(let col=2;col<=(hasSaturday?7:6);col++){
    const day=DAYS[col-2],header=sheet.getCell(timeLabelRow,col);header.value=day==='SAT'?'SATURDAY':({MON:'MONDAY',TUE:'TUESDAY',WED:'WEDNESDAY',THU:'THURSDAY',FRI:'FRIDAY'} as Record<string,string>)[day];
    header.alignment={horizontal:'center',vertical:'middle',wrapText:true};
  }
  for(let col=2;col<=(hasSaturday?7:6);col++){
    const day=DAYS[col-2],values=new Map<number,{text:string;color:string}>();
    for(let index=0;index<periods.length;index++){
      const period=periods[index];if(period.lunch)continue;
      const matches=blocks.filter(block=>block.day===day&&block.start<period.end&&block.end>period.start);
      if(!matches.length)continue;
      const text=matches.map(block=>block.text).join('\n\n'),color=matches.length>1?'FECACA':matches[0].color;
      values.set(index,{text,color});
    }
    let index=0;
    while(index<periods.length){
      const current=values.get(index);if(!current){index++;continue;}
      let last=index;
      while(last+1<periods.length&&!periods[last+1].lunch&&values.get(last+1)?.text===current.text)last++;
      const firstRow=scheduleFirstRow+index,lastRow=scheduleFirstRow+last;
      const cell=sheet.getCell(firstRow,col);cell.value=current.text;cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:`FF${/^[A-F\d]{6}$/i.test(current.color)?current.color:'D1FAE5'}`}};
      cell.font={...cell.font,name:'Calibri',bold:true,size:10,color:{argb:'FF000000'}};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};
      for(let row=firstRow;row<=lastRow;row++){sheet.getCell(row,col).fill=cloneValue(cell.fill);sheet.getCell(row,col).border=edge;}
      if(lastRow>firstRow)sheet.mergeCells(firstRow,col,lastRow,col);
      const lineCount=current.text.split('\n').length,required=(lineCount*11+6)/(last-index+1);
      for(let row=firstRow;row<=lastRow;row++)sheet.getRow(row).height=Math.max(sheet.getRow(row).height??16.8,required);
      index=last+1;
    }
  }
  const assignmentsForRows=[...assignments];
  for(let index=0;index<assignmentCount;index++){
    const row=assignmentStart+index,assignment=assignmentsForRows[index];
    sheet.getCell(row,1).value=assignment?`${assignment.subject_code} ${assignment.section_label}`:'';
    sheet.getCell(row,1).alignment={vertical:'middle',wrapText:true};
    if(assignment&&assignment.subject_code.length+assignment.section_label.length>28)sheet.getRow(row).height=Math.max(sheet.getRow(row).height??12.6,18);
    sheet.getCell(row,2).value=assignment?.lecture_hours??null;sheet.getCell(row,3).value=assignment?.lab_hours??null;
    sheet.getCell(row,4).value=null;sheet.getCell(row,5).value=null;sheet.getCell(row,6).value=null;
    if(assignment){
      formula(sheet,`H${row}`,`IF(B${row}>0,"${assignment.subject_id}","")`,assignment.lecture_hours>0?assignment.subject_id:'');
      formula(sheet,`I${row}`,`IF(C${row}>0,"${assignment.subject_id}","")`,assignment.lab_hours>0?assignment.subject_id:'');
    }
    formula(sheet,`D${row}`,`ROUND(B${row}+C${row}*${config.labCoefficient},2)`,assignment?round2(assignment.lecture_hours+assignment.lab_hours*config.labCoefficient):0);
  }
  sheet.getCell('E40').value='No. of Preparations:';
  // Blank preparation cells must use a nonzero denominator in SUMPRODUCT.
  formula(sheet,'F40',`SUMPRODUCT((H${assignmentStart}:H${assignmentEnd}<>"")/COUNTIF(H${assignmentStart}:H${assignmentEnd},H${assignmentStart}:H${assignmentEnd}&""))+SUMPRODUCT((I${assignmentStart}:I${assignmentEnd}<>"")/COUNTIF(I${assignmentStart}:I${assignmentEnd},I${assignmentStart}:I${assignmentEnd}&""))`,load?.preps??0);
  sheet.getCell('F40').numFmt='0';
  const designCreditStart=designationStart,designCreditEnd=designationStart+designationCount-1;
  const overloadSessionHours=(load?.sessions??[]).filter(session=>session.type==='OVERLOAD').map(session=>{const hours=round2((minutes(session.end_time)-minutes(session.start_time))/60);return hours>=config.minDesignationSessionHours&&Number.isInteger(hours)?hours:0;});
  overloadSessionHours.forEach((hours,index)=>{sheet.getCell(index+1,10).value=hours;});
  const studentCounts=(load?.students_by_section??[]).map(student=>student.student_count??0);
  studentCounts.forEach((count,index)=>{sheet.getCell(index+1,11).value=count;});
  const criteriaStart=1,criteriaEnd=Math.max(overloadSessionHours.length,1);
  const studentStart=1,studentEnd=Math.max(studentCounts.length,1);
  sheet.getCell('E41').value='Service Credits:';formula(sheet,'F41',`SUM(M${designCreditStart}:M${designCreditEnd})`,load?.service_credits??0);
  formula(sheet,'M1',prepCeilingFormula('F40',config.prepTiers),load?.prep_ceiling??0);
  sheet.getCell('E43').value='Teaching Overload:';formula(sheet,'F43',`ROUND(MAX(0,D${assignmentSubtotal}-M1),2)`,load?.teaching_overload??0);
  for(let row=42;row<=48;row++){if(row===43)continue;sheet.getCell(row,5).value=null;sheet.getCell(row,6).value=null;}
  sheet.getCell(assignmentSubtotal,1).value='Sub-Total';
  formula(sheet,`B${assignmentSubtotal}`,`SUM(B${assignmentStart}:B${assignmentEnd})`,load?.lecture_hours??0);
  formula(sheet,`C${assignmentSubtotal}`,`SUM(C${assignmentStart}:C${assignmentEnd})`,load?.lab_hours??0);
  formula(sheet,`D${assignmentSubtotal}`,`SUM(D${assignmentStart}:D${assignmentEnd})`,load?.teaching_hours??0);
  for(const [index,key]of(['research','extension','imp','consultation'] as const).entries()){
    const row=functionStart+index,value=load?.functions[key];sheet.getCell(row,1).value=key==='imp'?'IMP':key[0].toUpperCase()+key.slice(1);sheet.getCell(row,2).value=value?.counted??0;sheet.getCell(row,3).value=null;
    formula(sheet,`D${row}`,`ROUND(B${row}+C${row},2)`,value?.counted??0);
  }
  sheet.getCell(functionSubtotal,1).value='Sub-Total';
  for(const col of ['B','C','D'] as const)formula(sheet,`${col}${functionSubtotal}`,`SUM(${col}${functionStart}:${col}${functionEnd})`,col==='B'?round2(Object.values(load?.functions??{}).reduce((sum,value)=>sum+value.counted,0)):0);
  // Keep the student label and value in separate cells; no tall remarks box below them.
  for(let row=functionHeader;row<=designationSubtotal;row++)for(let col=5;col<=6;col++){
    sheet.getCell(row,col).value=null;
    sheet.getCell(row,col).border={};
    sheet.getCell(row,col).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFFFFF'}};
  }
  sheet.getCell(`E${functionHeader}`).value='Total Number of Students:';
  sheet.getCell(`E${functionHeader}`).alignment={vertical:'middle',wrapText:true,horizontal:'center'};
  sheet.getCell(`E${functionHeader}`).font={name:'Arial',size:9,color:{argb:'FF000000'}};
  sheet.getRow(functionHeader).height=26;
  formula(sheet,`F${functionHeader}`,`SUM(K${studentStart}:K${studentEnd})`,load?.total_students??0);sheet.getCell(`F${functionHeader}`).numFmt='0';
  sheet.getCell(`F${functionHeader}`).alignment={horizontal:'center',vertical:'middle'};
  sheet.getCell(`F${functionHeader}`).font={name:'Arial',size:11,bold:true,color:{argb:'FF000000'}};
  sheet.getCell(`E${functionHeader}`).border={top:thin,bottom:thin,left:thin};
  sheet.getCell(`F${functionHeader}`).border={top:thin,bottom:thin,right:thin};
  // Outline the full remarks space, with no internal grid lines.
  for(let row=functionHeader+1;row<=grandTotal;row++){
    sheet.getCell(row,5).border={left:thin,...(row===grandTotal?{bottom:thin}:{})};
    sheet.getCell(row,6).border={right:thin,...(row===grandTotal?{bottom:thin}:{})};
  }
  sheet.getCell(designationHeader,1).value='C.  Designation';
  for(let index=0;index<designationCount;index++){
    const row=designationStart+index,d=load?.designations[index];sheet.getCell(row,1).value=d?`${d.name}${d.accepted?'':' (Not accepted)'}`:'';sheet.getCell(row,1).alignment={vertical:'middle',wrapText:true};sheet.getCell(row,2).value=d?.hours??null;sheet.getCell(row,3).value=d?.plotted_hours??null;sheet.getCell(row,12).value=d?.accepted?1:0;
    sheet.getCell(row,5).value=null;
    formula(sheet,`D${row}`,`IF(AND(C${row}>=${config.minDesignationSessionHours},L${row}=1),MIN(B${row},C${row}),0)`,d?.counted_hours??0);
    const canGrant=Boolean(d?.grants_service_credit&&!/\b(chair|chairman|dean)\b/i.test(d.name));
    formula(sheet,`M${row}`,canGrant?`IF(AND(C${row}>=${config.minDesignationSessionHours},L${row}=1),${d?.service_credit??0},0)`:'0',d?.accepted&&canGrant?d.service_credit:0);
  }
  sheet.getCell(designationSubtotal,1).value='Sub-Total';
  for(const col of ['B','C','D'] as const)formula(sheet,`${col}${designationSubtotal}`,`SUM(${col}${designationStart}:${col}${designationEnd})`,col==='D'?load?.designation_hours??0:0);
  sheet.getCell(grandTotal,1).value='Grand Total (A+B+C)';sheet.getCell(grandTotal,5).value=null;sheet.getCell(grandTotal,6).value=null;
  formula(sheet,`D${grandTotal}`,`ROUND(MIN(D${assignmentSubtotal},M1)+D${functionSubtotal}+D${designationSubtotal},2)`,load?.total_faculty_time??0);
  const signatures=new Map(form.signatures.map(signature=>[signature.slot,signature]));
  sheet.getCell(preparedRow,1).value='Prepared by:';sheet.getCell(preparedRow,2).value=form.entity.name;sheet.getCell(preparedRow,4).value='Faculty';
  sheet.getCell(reviewedRow,1).value='Reviewed by:';sheet.getCell(reviewedRow,2).value=signatures.get('REVIEWED')?.name??'';sheet.getCell(reviewedRow,4).value=signatures.get('REVIEWED')?.title??'Chair';
  const verified=signatures.get('VERIFIED');
  sheet.getCell(verifiedRow,1).value='Verified by:';sheet.getCell(verifiedRow,2).value=verified?.name??'';sheet.getCell(verifiedRow,4).value=verified?.title??'Dean, COTE';
  sheet.getCell(approvedRow,1).value='Approved by:';sheet.getCell(approvedRow,2).value=signatures.get('APPROVED')?.name??'';sheet.getCell(approvedRow,4).value=signatures.get('APPROVED')?.title??'VP-Academic Affairs';
  sheet.getCell(effectivityRow,1).value=`Effective: ${form.effectivity.start??'Not set'} to ${form.effectivity.end??'Not set'}`;
  for(let row=1;row<=effectivityRow;row++)for(let col=1;col<=6;col++){
    const cell=sheet.getCell(row,col);if(!cell.alignment)cell.alignment={vertical:'middle'};
    if(row>=assignmentStart&&row<=assignmentEnd&&col===1)cell.alignment={vertical:'middle',wrapText:true};
  }
  sheet.pageSetup={orientation:'portrait',paperSize:1 as ExcelJS.PaperSize,fitToPage:true,fitToWidth:1,fitToHeight:1,horizontalCentered:true,printArea:`A1:${hasSaturday?'G':'F'}${effectivityRow}`,margins:{left:.25,right:.25,top:.5,bottom:.25,header:0,footer:0}};
  for(let row=3;row<=7;row++)sheet.getCell(row,6).border={};
  const centeredAnchor=(col:number,firstRow:number,lastRow:number,width:number,height:number)=>{
    const columnWidth=sheet.getColumn(col+1).width??8.43;
    // OOXML column widths include padding; convert to pixels using Excel's
    // maximum-digit-width rule, then to the EMUs used by image anchors.
    const columnPixels=Math.floor(columnWidth*7+5);
    const rowPixels=(row:number)=>(sheet.getRow(row+1).height??15)*4/3;
    const totalHeight=Array.from({length:lastRow-firstRow+1},(_,index)=>rowPixels(firstRow+index)).reduce((sum,value)=>sum+value,0);
    let offset=Math.max(0,(totalHeight-height)/2),row=firstRow;
    while(row<lastRow&&offset>=rowPixels(row)){offset-=rowPixels(row);row++;}
    // ExcelJS fractional anchors use width*10000 / points*10000 internally,
    // rather than actual cell pixels. Compensate so emitted offsets are exact.
    return {col:col+Math.max(0,(columnPixels-width)/2)/columnPixels,row:row+offset/rowPixels(row)};
  };
  const pitAnchor=centeredAnchor(0,0,6,74,74);
  await addLogo(workbook,sheet,form.settings.school_logo_path??'/school-logo.jpg',pitAnchor.col,74,74,pitAnchor.row);
  const coteLogo=await readPublicAsset('cote-logo.png');
  // Preserve the COTE artwork's 211:197 aspect ratio in its merged header cell.
  const coteHeight=80*197/211;
  const coteAnchor=centeredAnchor(1,0,6,80,coteHeight);
  if(coteLogo)addImage(workbook,sheet,coteLogo,'png',coteAnchor.col,coteAnchor.row,80,coteHeight);
  const tuvAnchor=centeredAnchor(5,2,6,118,55);
  if(form.settings.tuv_logo_path)await addLogo(workbook,sheet,form.settings.tuv_logo_path,tuvAnchor.col,118,55,tuvAnchor.row);
  else{
    sheet.getCell('F4').value='TUV NORD';sheet.getCell('F4').font={name:'Arial',size:16,bold:true,color:{argb:'FF5377B8'}};sheet.getCell('F4').alignment={horizontal:'center',vertical:'middle'};
    sheet.getCell('F5').value='PIT is ISO 9001:2015 certified by';sheet.getCell('F5').font={name:'Arial',size:8,color:{argb:'FF000000'}};sheet.getCell('F5').alignment={horizontal:'center',vertical:'middle',wrapText:true};
    sheet.getCell('F6').value='TUV NORD Philippines, Inc.';sheet.getCell('F6').font={name:'Arial',size:8,color:{argb:'FF000000'}};sheet.getCell('F6').alignment={horizontal:'center',vertical:'middle',wrapText:true};
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
async function buildRoomUtilizationWorkbook(form:Program){
  const wb=new ExcelJS.Workbook();wb.creator='FlowSched';
  const sheet=wb.addWorksheet('Classroom Utilization',{views:[{showGridLines:false}]});
  sheet.columns=[{width:5},{width:8},{width:8},...DAYS.map(()=>({width:16.5}))];
  const merge=(range:string,value:string,size=9,bold=false)=>{
    sheet.mergeCells(range);const cell=sheet.getCell(range.split(':')[0]);cell.value=value;
    cell.font={name:'Arial',size,bold,color:{argb:'FF000000'}};
    cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};
  };
  for(let row=1;row<=7;row++)sheet.getRow(row).height=18;
  merge('A1:B4','');
  merge('C1:E4',form.settings.school_lines,10,true);
  merge('F1:H2','CLASSROOM UTILIZATION',13,true);
  merge('F3:H4',form.term.label,9,true);
  merge('A5:B5','College:');merge('C5:E5',form.settings.college_lines);
  merge('A6:B6','Room:');merge('C6:E6',form.entity.name,10,true);
  merge('A7:E7','');
  sheet.getCell('F5').value='Program:';merge('G5:H5',form.settings.program);
  sheet.getCell('F6').value='Major:';merge('G6:H6','');
  sheet.getCell('F7').value='Yr/Sec:';merge('G7:H7','');
  const logo=sheet.getColumn(1).width!+sheet.getColumn(2).width!;
  await addLogo(wb,sheet,form.settings.school_logo_path??'/school-logo.jpg',(logo*7+10-76)/2/(sheet.getColumn(1).width!*7+5),76,76,0.5);
  merge('A8:C8','TIME',10,true);
  const names=['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'];
  names.forEach((name,index)=>{sheet.getCell(8,index+4).value=name;});
  const slots=form.slots.filter(slot=>DAYS.includes(slot.day_of_week));
  const start=Math.floor(Math.min(420,...slots.map(slot=>minutes(slot.start_time)))/30)*30;
  const end=Math.ceil(Math.max(1140,...slots.map(slot=>minutes(slot.end_time)))/30)*30;
  const count=(end-start)/30,first=9,last=first+count-1;
  const hour=(time:number)=>`${Math.floor(time/60)%12||12}:${String(time%60).padStart(2,'0')}`;
  for(let index=0;index<count;index++){
    const row=first+index,time=start+index*30;sheet.getRow(row).height=30;
    sheet.getCell(row,2).value=hour(time);sheet.getCell(row,3).value=hour(time+30);
    if(time>=720&&time<780)for(let col=1;col<=8;col++)sheet.getCell(row,col).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE7E7E7'}};
  }
  for(const [period,label] of [[0,'A.\nM.'],[1,'P.\nM.']] as const){
    const indices=Array.from({length:count},(_,index)=>index).filter(index=>(start+index*30<720?0:1)===period);
    if(indices.length){const top=first+indices[0],bottom=first+indices[indices.length-1];merge(`A${top}:A${bottom}`,label,10,true);}
  }
  for(let day=0;day<DAYS.length;day++){
    const daySlots=slots.filter(slot=>slot.day_of_week===DAYS[day]);
    let index=0;
    while(index<count){
      const time=start+index*30,matches=daySlots.filter(slot=>minutes(slot.start_time)<time+30&&minutes(slot.end_time)>time);
      if(!matches.length){index++;continue;}
      const key=matches.map(slot=>slot.id).join('|');let next=index+1;
      while(next<count){const t=start+next*30;if(daySlots.filter(slot=>minutes(slot.start_time)<t+30&&minutes(slot.end_time)>t).map(slot=>slot.id).join('|')!==key)break;next++;}
      const top=first+index,bottom=first+next-1,col=day+4;
      const text=matches.map(slot=>{
        const names=slot.faculty_name.trim().split(/\s+/);
        const faculty=names.length>1?`${names.slice(0,-1).map(name=>`${name[0]}.`).join('')}${names.at(-1)}`:slot.faculty_name;
        const section=slot.section_label.replace(/\s*\(Year\s+\d+\)\s*$/i,'');
        return `${slot.subject_code}${slot.session_type==='LAB'?' L':''}\n${section}\n${faculty}\n${slot.room_name??form.entity.name}`;
      }).join('\n\n');
      if(bottom>top)sheet.mergeCells(top,col,bottom,col);
      const cell=sheet.getCell(top,col);cell.value=text;
      const color=matches.length>1?'FECACA':matches[0].color?.replace(/^#/,'')??'FDE047';
      cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:`FF${/^[A-F\d]{6}$/i.test(color)?color:'FDE047'}`}};
      const lines=text.split('\n').reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length/22)),0);
      for(let row=top;row<=bottom;row++)sheet.getRow(row).height=Math.max(sheet.getRow(row).height??30,(lines*9.5+6)/(next-index));
      index=next;
    }
  }
  const footer=last+1;
  merge(`A${footer}:D${footer}`,'Prepared by:',9);
  merge(`E${footer}:H${footer}`,'Approved by:',9);
  merge(`A${footer+1}:D${footer+3}`,'');merge(`E${footer+1}:H${footer+3}`,'');
  for(let row=1;row<=footer+3;row++){
    if(row>last)sheet.getRow(row).height=18;
    for(let col=1;col<=8;col++){
      const cell=sheet.getCell(row,col);
      cell.border=edge;
      if(!cell.font?.name)cell.font={name:'Arial',size:row>=first?8.5:9,color:{argb:'FF000000'}};
      cell.alignment={...cell.alignment,horizontal:'center',vertical:'middle',wrapText:true};
      if(row===8){cell.font={name:'Arial',size:9,bold:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFA9D18E'}};}
    }
  }
  sheet.pageSetup={orientation:'portrait',paperSize:5,fitToPage:true,fitToWidth:1,fitToHeight:1,horizontalCentered:true,printArea:`A1:H${footer+3}`,margins:{left:.2,right:.2,top:.2,bottom:.2,header:0,footer:0}};
  return Buffer.from(await wb.xlsx.writeBuffer());
}
export async function buildProgramWorkbook(form:Program){
  if(form.kind==='faculty')return buildFacultyClassProgramWorkbook(form);
  if(form.kind==='rooms')return buildRoomUtilizationWorkbook(form);
  if(form.kind==='sections')return buildStudentProgramWorkbook(form,(wb,sheet)=>addLogo(wb,sheet,form.settings.school_logo_path??'/school-logo.jpg',.15,76,76,.35));
  const wb=new ExcelJS.Workbook();wb.creator='FlowSched';wb.calcProperties.fullCalcOnLoad=true;
  const s=wb.addWorksheet('Schedule',{views:[{state:'frozen',xSplit:1,ySplit:10,showGridLines:false}]});
  await addHeader(wb,s,form);
  const blocks=[...form.slots.map(slot=>({day:slot.day_of_week,start:minutes(slot.start_time),end:minutes(slot.end_time),text:`${slot.subject_code}${slot.session_type==='LAB'?' L':''}\n${slot.section_label}\n${slot.room_name??'TBA'}`,color:slot.color?.slice(1).toUpperCase()??'D1FAE5'})),...(form.load?.sessions??[]).map(session=>({day:session.day_of_week,start:minutes(session.start_time),end:minutes(session.end_time),text:session.type,color:FUNCTION_COLORS[session.type]}))];
  const start=Math.floor(Math.min(420,...blocks.map(b=>b.start))/30)*30,end=Math.ceil(Math.max(1200,...blocks.map(b=>b.end))/30)*30;
  s.getRow(10).values=['TIME',...DAYS];
  for(let col=1;col<=6;col++){const c=s.getCell(10,col);c.font={name:'Arial',size:10,bold:true};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFC6E0B4'}};c.border=edge;c.alignment={horizontal:'center'};}
  const count=(end-start)/30;
  for(let i=0;i<count;i++){
    const row=i+11,time=start+i*30;s.getRow(row).height=22;s.getCell(row,1).value=`${clock(time)} - ${clock(time+30)}`;
    for(let col=1;col<=6;col++){
      const cell=s.getCell(row,col);cell.font={name:'Arial',size:9};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};cell.border=edge;
      if(col===1)continue;
      const matches=blocks.filter(b=>b.day===DAYS[col-2]&&b.start<time+30&&b.end>time);
      if(!matches.length)continue;
      cell.value=matches.map(b=>b.text).join('\n\n');
      const hex=/^[A-F\d]{6}$/i.test(matches[0].color)?matches[0].color:'D1FAE5';
      cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:`FF${hex}`}};
      const rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));
      cell.font={...cell.font,color:{argb:rgb[0]*.299+rgb[1]*.587+rgb[2]*.114<140?'FFFFFFFF':'FF000000'}};
    }
  }
  for(let col=2;col<=6;col++)for(let i=0;i<count;){
    const row=11+i,value=s.getCell(row,col).value;let last=i;
    if(value){while(last+1<count&&s.getCell(12+last,col).value===value)last++;if(last>i)s.mergeCells(row,col,11+last,col);
      const lines=String(value).split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/24)),0);
      for(let r=row;r<=11+last;r++)s.getRow(r).height=Math.max(s.getRow(r).height??22,(lines*11+4)/(last-i+1));
    }i=last+1;
  }
  const footer=11+count+2;
  for(const [index,sig] of form.signatures.entries()){
    const from=[1,4,6][index],to=[3,5,7][index];
    for(let r=footer;r<=footer+3;r++)s.mergeCells(r,from,r,to);
    s.getCell(footer,from).value=`${sig.slot} BY:`;s.getCell(footer+2,from).value=sig.name;s.getCell(footer+3,from).value=sig.title;
    s.getCell(footer+2,from).border={bottom:thin};s.getCell(footer+2,from).font={name:'Arial',size:10,bold:true};
    s.getCell(footer+2,from).alignment={wrapText:true};s.getRow(footer+2).height=28;
  }
  s.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printArea:`A1:G${footer+4}`,margins:{left:.25,right:.25,top:.25,bottom:.25,header:0,footer:0}};
  return Buffer.from(await wb.xlsx.writeBuffer());
}
async function addTeachingLoad(wb:ExcelJS.Workbook,form:Program){
  const load=form.load!;const config=await getLoadConfig();
  const assignments=await prisma.workloadAssignment.findMany({where:{faculty_id:form.entity.id,term_id:form.term.id,deleted_at:null},include:{subject:true,section:true},orderBy:[{subject_id:'asc'},{section_id:'asc'}]});
  const s=wb.addWorksheet('Teaching Load',{views:[{state:'normal',showGridLines:false}]});
  s.columns=[{width:44},{width:18},{width:18},{width:23},{width:18},{width:20},{width:20},{width:18},{width:39}];
  s.getCell('A1').value=`Teaching Load — ${form.entity.name}`;s.getCell('A1').font={name:'Arial',size:15,bold:true};
  s.getCell('A2').value='Laboratory coefficient';s.getCell('B2').value=config.labCoefficient;
  s.getCell('A3').value='Weekly faculty time target';s.getCell('B3').value=config.facultyWeeklyHours;
  s.getCell('A4').value='Minimum valid session hours';s.getCell('B4').value=config.minDesignationSessionHours;
  s.getCell('A5').value=form.term.label;
  s.mergeCells('D5:G5');s.getCell('D5').value=`Effectivity: ${form.effectivity.start??'Not set'} to ${form.effectivity.end??'Not set'}`;
  s.getCell('H2').value='Minimum preps';s.getCell('I2').value='Maximum preps';s.getCell('J2').value='Ceiling';s.getColumn(10).width=15;
  config.prepTiers.forEach((tier,i)=>{s.getCell(i+3,8).value=tier.minPreps;s.getCell(i+3,9).value=tier.maxPreps;s.getCell(i+3,10).value=tier.ceiling;});
  const assignmentStart=31,assignmentEnd=assignmentStart+Math.max(1,assignments.length)-1;
  s.getRow(30).values=['Subject','Lecture hours','Lab hours','Section','Preps','Teaching hours'];
  const seenLec=new Set<string>(),seenLab=new Set<string>();
  for(let i=0;i<Math.max(1,assignments.length);i++){
    const row=assignmentStart+i,a=assignments[i];
    if(a){s.getCell(row,1).value=a.subject.code;s.getCell(row,2).value=a.subject.lecture_hours;s.getCell(row,3).value=a.subject.lab_hours;s.getCell(row,4).value=a.section.name;}
    const prep=a?(a.subject.lecture_hours>0&&!seenLec.has(a.subject_id)?1:0)+(a.subject.lab_hours>0&&!seenLab.has(a.subject_id)?1:0):0;
    if(a?.subject.lecture_hours)seenLec.add(a.subject_id);if(a?.subject.lab_hours)seenLab.add(a.subject_id);
    formula(s,`E${row}`,`IF(B${row}>0,IF(COUNTIFS($A$${assignmentStart}:A${row},A${row},$B$${assignmentStart}:B${row},">0")=1,1,0),0)+IF(C${row}>0,IF(COUNTIFS($A$${assignmentStart}:A${row},A${row},$C$${assignmentStart}:C${row},">0")=1,1,0),0)`,prep);
    formula(s,`F${row}`,`ROUND(B${row}+C${row}*$B$2,2)`,a?round2(a.subject.lecture_hours+a.subject.lab_hours*config.labCoefficient):0);
  }
  const functionStart=assignmentEnd+4,functionEnd=functionStart+3,designationStart=functionEnd+4,designationEnd=designationStart+Math.max(1,load.designations.length)-1;
  const studentStart=designationEnd+4,studentEnd=studentStart+Math.max(1,load.students_by_section.length)-1;
  const sessionStart=studentEnd+4,sessionEnd=sessionStart+Math.max(1,load.sessions.length)-1;
  s.getRow(functionStart-1).values=['Other Function','Declared','Plotted valid hours','Counted'];
  for(const [i,key]of(['research','extension','imp','consultation'] as const).entries()){
    const row=functionStart+i,value=load.functions[key];s.getCell(row,1).value=key.toUpperCase();s.getCell(row,2).value=value.declared;
    formula(s,`C${row}`,`SUMIFS($G$${sessionStart}:$G$${sessionEnd},$A$${sessionStart}:$A$${sessionEnd},A${row})`,value.plotted);
    formula(s,`D${row}`,`IF(C${row}>=$B$4,ROUND(MIN(B${row},C${row}),2),0)`,value.counted);
  }
  s.getRow(designationStart-1).values=['Designation','Assigned','Plotted valid hours','Grants credits (1/0)','Counted','Assigned credit','Earned credits','Accepted','Designation ID'];
  for(let i=0;i<Math.max(1,load.designations.length);i++){
    const row=designationStart+i,d=load.designations[i];if(d){s.getCell(row,1).value=d.name;s.getCell(row,2).value=d.hours;s.getCell(row,4).value=d.grants_service_credit&&!/\b(chair|chairman|dean)\b/i.test(d.name)?1:0;s.getCell(row,6).value=d.service_credit;s.getCell(row,9).value=d.id;}
    formula(s,`C${row}`,`SUMIFS($G$${sessionStart}:$G$${sessionEnd},$A$${sessionStart}:$A$${sessionEnd},"DESIGNATION",$B$${sessionStart}:$B$${sessionEnd},I${row})`,d?.plotted_hours??0);
    formula(s,`E${row}`,`IF(C${row}>=$B$4,ROUND(MIN(B${row},C${row}),2),0)`,d?.counted_hours??0);
    formula(s,`G${row}`,`IF(AND(C${row}>=$B$4,D${row}=1),F${row},0)`,d?.accepted&&d.grants_service_credit&&!/\b(chair|chairman|dean)\b/i.test(d.name)?d.service_credit:0);
    formula(s,`H${row}`,`IF(C${row}>=$B$4,"Accepted","Not accepted")`,d?.accepted?'Accepted':'Not accepted');
  }
  s.getRow(studentStart-1).values=['Distinct section','Students'];load.students_by_section.forEach((student,i)=>{s.getCell(studentStart+i,1).value=student.section_name;s.getCell(studentStart+i,2).value=student.student_count;});
  s.getRow(sessionStart-1).values=['Session type','Designation ID','Day','Start','End','Duration','Valid hours'];
  for(let i=0;i<Math.max(1,load.sessions.length);i++){
    const row=sessionStart+i,session=load.sessions[i];if(session){s.getCell(row,1).value=session.type;s.getCell(row,2).value=session.faculty_designation_id;s.getCell(row,3).value=session.day_of_week;s.getCell(row,4).value=minutes(session.start_time)/1440;s.getCell(row,5).value=minutes(session.end_time)/1440;}
    s.getCell(row,4).numFmt=s.getCell(row,5).numFmt='h:mm AM/PM';const duration=session?round2((minutes(session.end_time)-minutes(session.start_time))/60):0;
    formula(s,`F${row}`,`IF(COUNT(D${row}:E${row})=2,ROUND((E${row}-D${row})*24,2),0)`,duration);
    formula(s,`G${row}`,`IF(F${row}>=$B$4,IF(A${row}="OVERLOAD",IF(MOD(F${row},1)=0,F${row},0),F${row}),0)`,duration>=config.minDesignationSessionHours&&(!session||session.type!=='OVERLOAD'||Number.isInteger(duration))?duration:0);
  }
  const metrics:[string,string,number|string][]=[
    ['Lecture hours',`SUM(B${assignmentStart}:B${assignmentEnd})`,load.lecture_hours],['Laboratory hours',`SUM(C${assignmentStart}:C${assignmentEnd})`,load.lab_hours],['Weighted laboratory hours','ROUND(B8*$B$2,2)',load.weighted_lab_hours],['Teaching hours','ROUND(SUM(B7,B9),2)',load.teaching_hours],['Preparations',`SUM(E${assignmentStart}:E${assignmentEnd})`,load.preps],['Regular ceiling',`IF(B11=0,0,LOOKUP(B11,H3:H${config.prepTiers.length+2},J3:J${config.prepTiers.length+2}))`,load.prep_ceiling],['Ceiling source',`IF(B11=0,"NONE",IF(B11>I${config.prepTiers.length+2},"EXTRAPOLATED","TIER"))`,load.prep_ceiling_source],['Teaching Overload','ROUND(MAX(0,B10-B12),2)',load.teaching_overload],['Claimable overload hours','INT(B14)',load.claimable_overload_hours],['Teaching Service Credit','ROUND(B14-B15,2)',load.teaching_service_credit],['Overload plotted hours',`SUMIFS(G${sessionStart}:G${sessionEnd},A${sessionStart}:A${sessionEnd},"OVERLOAD")`,load.overload_plotted_hours],['Claim for Teaching Overload','MIN(B17,B15)',load.claim_session_hours],['Overload remaining to plot','MAX(0,B15-B17)',load.overload_remaining_to_plot],['Regular teaching hours','MIN(B10,B12)',load.regular_teaching_hours],['Designation hours',`SUM(E${designationStart}:E${designationEnd})`,load.designation_hours],['Service Credits (outside weekly target)',`SUM(G${designationStart}:G${designationEnd})`,load.service_credits],['Total faculty time',`ROUND(B20+SUM(D${functionStart}:D${functionEnd})+B21,2)`,load.total_faculty_time],['Remaining to target','ROUND(B3-B23,2)',load.remaining_to_target],['Total students',`SUM(B${studentStart}:B${studentEnd})`,load.total_students],['Overload plot check','IF(B17>B15,"OVERLOAD CAP EXCEEDED","Within claimable")',load.overload_plotted_hours>load.claimable_overload_hours?'OVERLOAD CAP EXCEEDED':'Within claimable'],
  ];
  metrics.forEach(([label,text,value],i)=>{s.getCell(i+7,1).value=label;formula(s,`B${i+7}`,text,value);});
  s.getCell('D2').value='Counting rule: MIN_DECLARED_PLOTTED';s.mergeCells('D2:G2');
  s.getCell('D3').value='Edit declared hours, assignment hours, session times or student counts below.';s.mergeCells('D3:G4');s.getCell('D3').alignment={wrapText:true};
  const prepStart=sessionEnd+4;
  s.getRow(prepStart).values=['Preparation subject','Component'];load.prep_breakdown.forEach((prep,i)=>{s.getCell(prepStart+i+1,1).value=prep.subject_code??prep.subject_id;s.getCell(prepStart+i+1,2).value=prep.component;});
  const warningStart=prepStart+load.prep_breakdown.length+3;
  s.getCell(warningStart,1).value='Warnings at export';load.warnings.forEach((warning,i)=>{s.mergeCells(warningStart+i+1,1,warningStart+i+1,7);s.getCell(warningStart+i+1,1).value=warning;s.getCell(warningStart+i+1,1).alignment={wrapText:true};s.getRow(warningStart+i+1).height=30;});
  for(const row of [30,functionStart-1,designationStart-1,studentStart-1,sessionStart-1])s.getRow(row).eachCell(cell=>{cell.font={name:'Arial',size:10,bold:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFC6E0B4'}};cell.alignment={wrapText:true};s.getRow(row).height=30;});
  s.eachRow(row=>{row.eachCell(cell=>{cell.font={name:'Arial',size:10,...cell.font};if(!cell.alignment)cell.alignment={vertical:'middle'};});});
  s.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0};
}
