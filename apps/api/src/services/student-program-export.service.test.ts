import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildStudentProgramWorkbook } from './student-program-export.service.js';

describe('Student Class Program Excel',()=>{
  it('keeps Saturday classes, faculty and rooms in the portrait reference form',async()=>{
    const form={entity:{name:'1-C (Year 1)'},term:{label:'2nd Sem. S.Y. 2024-2025'},settings:{school_lines:'Republic of the Philippines\nPalompon Institute of Technology\nPalompon, Leyte',college_lines:'College of Technology and Engineering',department:'Industrial Technology',program:'BIndTech',major:'Electronics'},signatures:[{slot:'PREPARED',name:'Chair Name',title:'Chair'}],slots:[{id:'sat',day_of_week:'SAT',start_time:'08:00',end_time:'10:00',subject_code:'ELX 12a',faculty_name:'R. Entoma',room_name:'COTE 252',session_type:'LAB',color:'#86bf21'}]} as Parameters<typeof buildStudentProgramWorkbook>[0];
    const bytes=await buildStudentProgramWorkbook(form,async()=>{});
    const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes as never);
    const sheet=workbook.worksheets[0]!;
    expect(sheet.getCell('H1').value).toBe('STUDENT CLASS PROGRAM');
    expect(sheet.getCell('I6').value).toBe('Electronics');
    expect(sheet.getCell('J8').value).toBe('SATURDAY');
    expect(sheet.getCell('J10').value).toBe('ELX 12a (Lab)\nR. Entoma\nCOTE 252');
    expect(sheet.getCell('J13').master.address).toBe('J10');
    expect(sheet.getCell('E18').value).toBe('N O O N  B R E A K');
    expect(sheet.pageSetup.orientation).toBe('portrait');
    expect(sheet.pageSetup.fitToHeight).toBe(1);
    expect(sheet.pageSetup.printArea).toContain('J');
  });
});
