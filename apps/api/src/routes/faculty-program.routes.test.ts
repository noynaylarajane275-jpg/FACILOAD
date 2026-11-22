import { afterAll,beforeAll,beforeEach,describe,expect,it } from 'vitest';
import request from 'supertest';
import { prisma } from '../config/prisma.js';
import { createApp } from '../app.js';
import { signAccessToken } from '../services/auth.service.js';
import ExcelJS from 'exceljs';
const prefix=`FSP-${process.pid}-${Date.now()}-`;
let faculty='',other='',term='',assignment='',section='',room='',designation='',chair='',own='',outsider='';
const app=createApp();
const session=(extra:Record<string,unknown>={})=>({type:'RESEARCH',day_of_week:'MON',start_time:'08:00',end_time:'09:00',...extra});
const endpoint=(part:string,id=faculty)=>`/api/faculty/${id}/${part}?termId=${term}`;
const seedFinalSession=(extra:Record<string,string|null>={})=>prisma.facultySession.create({data:{faculty_id:faculty,term_id:term,type:'RESEARCH',day_of_week:'MON',start_time:'08:00',end_time:'09:00',...extra}});
beforeAll(async()=>{
  process.env.JWT_SECRET??='test-access-secret';
  const a=await prisma.faculty.create({data:{employee_no:prefix+'A',first_name:'Fixture',last_name:'A'}});faculty=a.id;
  other=(await prisma.faculty.create({data:{employee_no:prefix+'B',first_name:'Fixture',last_name:'B'}})).id;
  term=(await prisma.academicTerm.create({data:{school_year:prefix+'2026',semester:'SECOND',effectivity_start:'2026-11-01',effectivity_end:'2027-03-31'}})).id;
  room=(await prisma.room.create({data:{name:prefix+'Room'}})).id;
  const subject=await prisma.subject.create({data:{code:prefix+'IE',title:'Fixture subject',units:3,lecture_hours:3,lab_hours:3}});
  for(let i=0;i<5;i++){
    const s=await prisma.section.create({data:{name:prefix+i,year_level:1}});
    const a=await prisma.workloadAssignment.create({data:{faculty_id:faculty,term_id:term,subject_id:subject.id,section_id:s.id}});
    if(!assignment){assignment=a.id;section=s.id;}
  }
  designation=(await prisma.designation.create({data:{name:prefix+'Coordinator',default_hours:6,grants_service_credit:true,service_credit_hours:2}})).id;
  chair=signAccessToken({userId:'test-chair',role:'CHAIR',facultyId:null});
  own=signAccessToken({userId:'test-faculty',role:'FACULTY',facultyId:faculty});
  outsider=signAccessToken({userId:'test-other',role:'FACULTY',facultyId:other});
});
beforeEach(async()=>{
  await prisma.plannerNotification.deleteMany({where:{submission:{faculty_id:faculty,term_id:term}}});
  await prisma.plannerSubmission.deleteMany({where:{faculty_id:faculty,term_id:term}});
  await prisma.plannerDraft.deleteMany({where:{faculty_id:faculty,term_id:term}});
  await prisma.workloadAssignment.deleteMany({where:{term_id:term,subject:{code:prefix+'SECOND'}}});
  await prisma.subject.deleteMany({where:{code:prefix+'SECOND'}});
  await prisma.facultySession.deleteMany({where:{term_id:term}});
  await prisma.scheduleSlot.deleteMany({where:{workload_assignment:{term_id:term}}});
  await prisma.facultyLoad.deleteMany({where:{term_id:term}});
  await prisma.facultySectionStudents.deleteMany({where:{term_id:term}});
  await prisma.facultyDesignation.deleteMany({where:{term_id:term}});
});
afterAll(async()=>{
  await prisma.plannerNotification.deleteMany({where:{submission:{faculty_id:faculty,term_id:term}}});
  await prisma.plannerSubmission.deleteMany({where:{faculty_id:faculty,term_id:term}});
  await prisma.plannerDraft.deleteMany({where:{faculty_id:faculty,term_id:term}});
  await prisma.facultySession.deleteMany({where:{term_id:term}});
  await prisma.facultyDesignation.deleteMany({where:{term_id:term}});
  await prisma.workloadAssignment.deleteMany({where:{term_id:term}});
  await prisma.faculty.deleteMany({where:{employee_no:{startsWith:prefix}}});
  await prisma.subject.deleteMany({where:{code:{startsWith:prefix}}});
  await prisma.section.deleteMany({where:{name:{startsWith:prefix}}});
  await prisma.room.deleteMany({where:{name:{startsWith:prefix}}});
  await prisma.academicTerm.deleteMany({where:{id:term}});
  await prisma.designation.deleteMany({where:{name:{startsWith:prefix}}});
  await prisma.signatoryOption.deleteMany({where:{name:{startsWith:prefix}}});
});
describe('faculty program APIs',()=>{
  it('schedule slots accept faculty, section and room scopes with validated UUIDs',async()=>{
    await prisma.scheduleSlot.create({data:{workload_assignment_id:assignment,room_id:room,session_type:'LECTURE',day_of_week:'MON',start_time:'14:00',end_time:'15:00'}});
    for(const query of [`facultyId=${faculty}`,`sectionId=${section}`]){
      const res=await request(app).get(`/api/schedule-slots?termId=${term}&${query}`).set('Authorization',`Bearer ${chair}`);expect(res.status).toBe(200);expect(res.body.data).toHaveLength(1);
    }
    expect((await request(app).get(`/api/schedule-slots?termId=${term}&facultyId=${other}`).set('Authorization',`Bearer ${chair}`)).body.data).toHaveLength(0);
    const roomScope=await request(app).get(`/api/schedule-slots?termId=${term}&roomId=${section}`).set('Authorization',`Bearer ${chair}`);expect(roomScope.status).toBe(200);expect(roomScope.body.data).toHaveLength(0);
    expect((await request(app).get(`/api/schedule-slots?termId=${term}&roomId=${room}`).set('Authorization',`Bearer ${chair}`)).body.data).toHaveLength(1);
    expect((await request(app).get('/api/schedule-slots?roomId=invalid').set('Authorization',`Bearer ${chair}`)).status).toBe(400);
  });
  it('F10: faculty cannot read or edit someone else’s load, sessions, functions, or students',async()=>{
    for(const part of ['teaching-load','sessions','students']) expect((await request(app).get(endpoint(part)).set('Authorization',`Bearer ${outsider}`)).status).toBe(403);
    for(const part of ['functions','students']) expect((await request(app).put(endpoint(part)).set('Authorization',`Bearer ${outsider}`).send({})).status).toBe(403);
    for(const token of [outsider,own,chair]){
      const write=await request(app).post(endpoint('sessions')).set('Authorization',`Bearer ${token}`).send(session());
      expect(write.status).toBe(409);expect(write.body.error.code).toBe('PLANNER_APPROVAL_REQUIRED');
    }
  });
  it('validates minima and permits the Chair to override consultation',async()=>{
    const data={research_hours:6,extension_hours:4,imp_hours:0,consultation_hours:4};
    expect((await request(app).put(endpoint('functions')).set('Authorization',`Bearer ${own}`).send({...data,research_hours:0})).status).toBe(400);
    expect((await request(app).put(endpoint('functions')).set('Authorization',`Bearer ${own}`).send({...data,consultation_hours:3})).status).toBe(403);
    expect((await request(app).put(endpoint('functions')).set('Authorization',`Bearer ${chair}`).send({...data,consultation_hours:3})).status).toBe(200);
  });
  it('counts declared vs plotted functions from persisted sessions on read',async()=>{
    await request(app).put(endpoint('functions')).set('Authorization',`Bearer ${own}`).send({research_hours:6,extension_hours:4,imp_hours:0});
    await seedFinalSession({end_time:'10:00'});
    const res=await request(app).get(endpoint('teaching-load')).set('Authorization',`Bearer ${own}`);
    expect(res.status).toBe(200);expect(res.body.load.functions.research).toEqual({declared:6,plotted:2,counted:2});expect(res.body.load.total_faculty_time).toBe(23);
  });
  it('validates overload duration and ceiling when saving the faculty draft',async()=>{
    for(const end_time of ['08:30','09:30']){
      const tooShort=await request(app).put(endpoint('planner-draft')).set('Authorization',`Bearer ${own}`).send({sessions:[session({type:'OVERLOAD',end_time})]});
      expect(tooShort.status).toBe(400);
    }
    const accepted=await request(app).put(endpoint('planner-draft')).set('Authorization',`Bearer ${own}`).send({sessions:[session({type:'OVERLOAD',start_time:'08:00',end_time:'12:00'})]});
    expect(accepted.status).toBe(200);
    const tooMany=await request(app).put(endpoint('planner-draft')).set('Authorization',`Bearer ${own}`).send({sessions:[
      session({type:'OVERLOAD',start_time:'08:00',end_time:'12:00'}),
      session({type:'OVERLOAD',start_time:'13:00',end_time:'14:00'}),
    ]});
    expect(tooMany.status).toBe(409);expect(tooMany.body.error.code).toBe('OVERLOAD_CAP_EXCEEDED');
  });
  it('designations require valid sessions and only accepted flagged designations earn credit',async()=>{
    const assigned=await request(app).post(`/api/faculty/${faculty}/designations`).set('Authorization',`Bearer ${chair}`).send({designation_id:designation,term_id:term,hours:6,service_credit:2});
    expect(assigned.status).toBe(201);const id=assigned.body.designation.id;
    const duplicate=await request(app).post(`/api/faculty/${faculty}/designations`).set('Authorization',`Bearer ${chair}`).send({designation_id:designation,term_id:term,hours:6});expect(duplicate.status).toBe(409);
    const invalid=await request(app).put(endpoint('planner-draft')).set('Authorization',`Bearer ${own}`).send({sessions:[session({type:'DESIGNATION',faculty_designation_id:id,end_time:'08:30'})]});
    expect(invalid.status).toBe(400);
    const saved=await request(app).put(endpoint('planner-draft')).set('Authorization',`Bearer ${own}`).send({sessions:[session({type:'DESIGNATION',faculty_designation_id:id,start_time:'14:00',end_time:'20:00'})]});
    expect(saved.status).toBe(200);
    await seedFinalSession({type:'DESIGNATION',faculty_designation_id:id,start_time:'14:00',end_time:'20:00'});
    const res=await request(app).get(endpoint('teaching-load')).set('Authorization',`Bearer ${own}`);expect(res.body.load.designation_hours).toBe(6);expect(res.body.load.service_credits).toBe(2);
  });
  it('prevents direct edits to final sessions outside Chairman approval',async()=>{
    const first=await seedFinalSession();
    const blockedPost=await request(app).post(endpoint('sessions')).set('Authorization',`Bearer ${chair}`).send(session({type:'EXTENSION'}));
    expect(blockedPost.status).toBe(409);expect(blockedPost.body.error.code).toBe('PLANNER_APPROVAL_REQUIRED');
    expect((await request(app).patch(`/api/faculty-sessions/${first.id}`).set('Authorization',`Bearer ${chair}`).send({start_time:'10:00',end_time:'11:00'})).status).toBe(409);
    expect((await request(app).delete(`/api/faculty-sessions/${first.id}`).set('Authorization',`Bearer ${chair}`)).status).toBe(409);
  });
  it('rejects session-vs-teaching and teaching-vs-session with existing override flow',async()=>{
    await seedFinalSession();
    const placement={workload_assignment_id:assignment,session_type:'LECTURE',day_of_week:'MON',start_time:'08:00',end_time:'09:00'};
    const clash=await request(app).post('/api/schedule-slots').set('Authorization',`Bearer ${chair}`).send(placement);
    expect(clash.status).toBe(409);expect(clash.body.error.details.conflicting_slots[0].subject_code).toBe('RESEARCH');
    const {workload_assignment_id,...override}=placement;
    expect((await request(app).post(`/api/schedule-slots/${assignment}/confirm-override`).set('Authorization',`Bearer ${chair}`).send(override)).status).toBe(201);
    const next=await request(app).put(endpoint('planner-draft')).set('Authorization',`Bearer ${own}`).send({sessions:[session({type:'EXTENSION'})]});expect(next.status).toBe(409);
  });
  it('validates student ranges/handled sections and deduplicates sections across subjects',async()=>{
    const second=await prisma.subject.create({data:{code:prefix+'SECOND',title:'Other subject',units:3,lecture_hours:3}});
    await prisma.workloadAssignment.create({data:{faculty_id:faculty,term_id:term,section_id:section,subject_id:second.id}});
    for(const count of [-1,201,2.5]) expect((await request(app).put(endpoint('students')).set('Authorization',`Bearer ${own}`).send({students:[{section_id:section,student_count:count}]})).status).toBe(400);
    const res=await request(app).put(endpoint('students')).set('Authorization',`Bearer ${own}`).send({students:[{section_id:section,student_count:35}]});expect(res.status).toBe(200);expect(res.body.total_students).toBe(35);expect(res.body.students).toHaveLength(5);
  });
  it('validates term dates and does not allow faculty effectivity overrides',async()=>{
    expect((await request(app).patch(`/api/terms/${term}/effectivity`).set('Authorization',`Bearer ${chair}`).send({effectivity_start:'2026-02-30',effectivity_end:'2026-02-01'})).status).toBe(400);
    await request(app).patch(`/api/terms/${term}/effectivity`).set('Authorization',`Bearer ${chair}`).send({effectivity_start:'2026-12-01',effectivity_end:'2027-01-31'}).expect(200);
    const override=await request(app).put(endpoint('effectivity')).set('Authorization',`Bearer ${chair}`).send({effectivity_start:'2026-12-01',effectivity_end:'2027-01-31'});expect(override.status).toBe(404);
    const load=await request(app).get(endpoint('teaching-load')).set('Authorization',`Bearer ${own}`);expect(load.body.load.effectivity).toEqual({start:'2026-12-01',end:'2027-01-31',source:'TERM'});
    await request(app).patch(`/api/terms/${term}/effectivity`).set('Authorization',`Bearer ${chair}`).send({effectivity_start:'2026-11-01',effectivity_end:'2027-03-31'}).expect(200);
  });
  it('protects Chair settings, validates signatories, and soft-deletes options',async()=>{
    for(const path of ['/api/load-settings','/api/form-settings']) expect((await request(app).put(path).set('Authorization',`Bearer ${own}`).send({})).status).toBe(403);
    const option=await request(app).post('/api/signatory-options').set('Authorization',`Bearer ${chair}`).send({slot:'PREPARED',name:prefix+'Signatory',title:'Fixture'});expect(option.status).toBe(201);
    expect((await request(app).delete(`/api/signatory-options/${option.body.option.id}`).set('Authorization',`Bearer ${chair}`)).status).toBe(204);
    expect((await prisma.signatoryOption.findUnique({where:{id:option.body.option.id}}))?.active).toBe(false);
  });
  it('shares form settings and signatory options, accepts print-only custom signatures, and scopes forms',async()=>{
    const res=await request(app).get(`/api/forms/faculty/${faculty}?termId=${term}&sig_prepared=Fixture%20Custom`).set('Authorization',`Bearer ${own}`);
    expect(res.status).toBe(200);expect(res.body.template.type).toBe('FACULTY_CLASS_PROGRAM');expect(res.body.signatures[0].name).toBe('Fixture Custom');
    expect(res.body.effectivity).toEqual({start:'2026-11-01',end:'2027-03-31',source:'TERM'});
    expect(res.body.load.teaching_hours).toBe(25.5);
    expect((await prisma.signatoryOption.count({where:{name:'Fixture Custom'}}))).toBe(0);
    expect((await request(app).get(`/api/forms/faculty/${faculty}?termId=${term}`).set('Authorization',`Bearer ${outsider}`)).status).toBe(403);
    expect((await request(app).get(`/api/forms/sections/${section}?termId=${term}`).set('Authorization',`Bearer ${own}`)).status).toBe(403);
    const student=await request(app).get(`/api/forms/sections/${section}?termId=${term}`).set('Authorization',`Bearer ${chair}`);expect(student.status).toBe(200);expect(student.body.template.type).toBe('STUDENT_CLASS_PROGRAM');
    const invalidSig=await request(app).get(`/api/forms/faculty/${faculty}?termId=${term}&sig_prepared=${room}`).set('Authorization',`Bearer ${chair}`);expect(invalidSig.status).toBe(400);
  });
  it('exports the reference faculty template with automatic Prepared by, four signatures and summary formulas',async()=>{
    const response=await request(app).get(`/api/exports/faculty/${faculty}?termId=${term}&sig_prepared=Fixture%20Prepared`).set('Authorization',`Bearer ${own}`).buffer(true).parse((res,done)=>{const chunks:Buffer[]=[];res.on('data',(chunk:Buffer)=>chunks.push(chunk));res.on('end',()=>done(null,Buffer.concat(chunks)));});
    expect(response.status).toBe(200);expect(response.headers['content-type']).toContain('spreadsheetml');
    const wb=new ExcelJS.Workbook();await wb.xlsx.load(response.body);expect(wb.worksheets.map(s=>s.name)).toEqual(['Faculty Class Program']);
    const sheet=wb.worksheets[0]!;
    expect(sheet.getCell('C6').value).toBe("INSTRUCTOR'S CLASS PROGRAM");expect(sheet.getCell('F1').value).toContain('PIT-COTE-FOR-3-2-01B');expect(sheet.getImages().length).toBeGreaterThanOrEqual(1);
    expect(sheet.getCell('B9').value).toBe('Fixture A');expect(sheet.getCell('B66').value).toBe('Fixture A');expect(sheet.getCell('B66').value).not.toBe('Fixture Prepared');
    expect(sheet.getCell('A66').value).toBe('Prepared by:');expect(sheet.getCell('A67').value).toBe('Reviewed by:');expect(sheet.getCell('A68').value).toBe('Verified by:');expect(sheet.getCell('A69').value).toBe('Approved by:');
    expect(sheet.getCell('B49').result).toBe(15);expect(sheet.getCell('C49').result).toBe(15);expect(sheet.getCell('D49').result).toBe(25.5);
    expect(sheet.getCell('F40').result).toBe(2);expect(sheet.getCell('F41').result).toBe(0);expect(sheet.getCell('F43').result).toBe(4.5);
    expect(sheet.getCell('F51').result).toBe(0);expect(sheet.getCell('F40').formula).toContain('SUMPRODUCT');expect(sheet.getCell('D63').formula).toContain('MIN(D49,M1)');
    expect(sheet.pageSetup.orientation).toBe('portrait');expect(sheet.pageSetup.fitToHeight).toBe(1);expect(sheet.pageSetup.printArea).toContain('F70');
  });
  it('exports section forms without faculty sheets and enforces ownership on all export kinds',async()=>{
    expect((await request(app).get(`/api/exports/faculty/${faculty}?termId=${term}`).set('Authorization',`Bearer ${outsider}`)).status).toBe(403);
    expect((await request(app).get(`/api/exports/sections/${section}?termId=${term}`).set('Authorization',`Bearer ${own}`)).status).toBe(403);
    const response=await request(app).get(`/api/exports/sections/${section}?termId=${term}`).set('Authorization',`Bearer ${chair}`).buffer(true).parse((res,done)=>{const chunks:Buffer[]=[];res.on('data',(chunk:Buffer)=>chunks.push(chunk));res.on('end',()=>done(null,Buffer.concat(chunks)));});
    expect(response.status).toBe(200);const wb=new ExcelJS.Workbook();await wb.xlsx.load(response.body);expect(wb.worksheets).toHaveLength(1);expect(wb.worksheets[0].getCell('H1').value).toBe('STUDENT CLASS PROGRAM');
    const roomResponse=await request(app).get(`/api/exports/rooms/${room}?termId=${term}`).set('Authorization',`Bearer ${chair}`).buffer(true).parse((res,done)=>{const chunks:Buffer[]=[];res.on('data',(chunk:Buffer)=>chunks.push(chunk));res.on('end',()=>done(null,Buffer.concat(chunks)));});
    expect(roomResponse.status).toBe(200);const roomBook=new ExcelJS.Workbook();await roomBook.xlsx.load(roomResponse.body);
    const roomSheet=roomBook.worksheets[0]!;
    expect(roomSheet.name).toBe('Classroom Utilization');
    expect(roomSheet.getCell('F1').value).toBe('CLASSROOM UTILIZATION');
    expect(roomSheet.getCell('C6').value).toBe(prefix+'Room');
    expect(roomSheet.getCell('D8').value).toBe('MONDAY');
    expect(roomSheet.getCell('H8').value).toBe('FRIDAY');
    expect(roomSheet.pageSetup.orientation).toBe('portrait');
    expect(roomSheet.pageSetup.paperSize).toBe(5);
    expect(roomSheet.pageSetup.fitToHeight).toBe(1);
    expect(roomSheet.getImages().length).toBeGreaterThanOrEqual(1);
  });
});
