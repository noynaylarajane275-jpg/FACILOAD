import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { TeachingLoadPage } from './TeachingLoadPage';
import { useAuthStore } from '../store/auth.store';
import { useTermStore } from '../store/term.store';
import { ToastProvider } from '../components/Toast';
import { getTeachingLoad,getLoadSettings,getDesignations,type TeachingLoad } from '../lib/teaching-load';
import { listFaculty } from '../lib/faculty';
import { apiFetch } from '../lib/api';
vi.mock('../lib/teaching-load',async(importOriginal)=>({...await importOriginal<typeof import('../lib/teaching-load')>(),getTeachingLoad:vi.fn(),getLoadSettings:vi.fn(),getDesignations:vi.fn()}));
vi.mock('../lib/faculty',()=>({listFaculty:vi.fn()}));
vi.mock('../lib/api',()=>({apiFetch:vi.fn()}));
const load:TeachingLoad={lecture_hours:15,lab_hours:6,weighted_lab_hours:4.2,teaching_hours:19.2,preps:3,prep_breakdown:[{subject_id:'subject',subject_code:'IE 322',component:'LAB'}],prep_ceiling:18,prep_ceiling_source:'TIER',teaching_overload:1.2,claimable_overload_hours:1,teaching_service_credit:.2,overload_plotted_hours:0,claim_session_hours:0,overload_remaining_to_plot:1,regular_teaching_hours:18,designation_hours:0,total_faculty_time:18,remaining_to_target:22,service_credits:2,weekly_hours:40,functions:{research:{declared:1,plotted:0,counted:0},extension:{declared:1,plotted:0,counted:0},imp:{declared:0,plotted:0,counted:0},consultation:{declared:4,plotted:0,counted:0}},designations:[],sessions:[],students_by_section:[{section_id:'sec1',section_name:'BSIE 1A',student_count:30},{section_id:'sec2',section_name:'BSIE 2A',student_count:null}],total_students:30,effectivity:{start:null,end:null,source:'TERM'},warnings:['Student counts are missing.']};
beforeEach(()=>{
  vi.clearAllMocks();
  useAuthStore.setState({user:{id:'u',email:'fixture@test.local',role:'FACULTY',facultyId:'f1'},isAuthenticated:true,isInitializing:false});
  useTermStore.setState({status:'ready',selectedTermId:'t1',terms:[{id:'t1',label:'2026–2027 Second Semester',school_year:'2026-2027',semester:'SECOND',is_active:true,created_at:''}]});
  vi.mocked(getTeachingLoad).mockResolvedValue({faculty:{id:'f1',first_name:'Jose',last_name:'Reyes'},load});
  vi.mocked(getLoadSettings).mockResolvedValue({settings:{lab_coefficient:.7,weekly_hours:40,consultation_hours:4,min_research:1,min_extension:1,min_imp:0,min_session_hours:1,prep_tiers:[]}});
  vi.mocked(getDesignations).mockResolvedValue({data:[]});
  vi.mocked(listFaculty).mockResolvedValue({data:[{id:'f1',first_name:'Jose',last_name:'Reyes',employee_no:'fixture'}] as never,meta:{total:1,page:1,pageSize:100,pageCount:1}});
  vi.mocked(apiFetch).mockResolvedValue({});
});
const mount=()=>render(<ToastProvider><TeachingLoadPage/></ToastProvider>);
afterEach(cleanup);
describe('Teaching Load page',()=>{
  it('reads the own faculty load and separates Teaching Service Credit from Service Credits',async()=>{
    mount();expect(await screen.findByText('19.2h')).toBeInTheDocument();expect(getTeachingLoad).toHaveBeenCalledWith('f1','t1');
    expect(screen.getByText('Teaching Service Credit: 0.2h')).toBeInTheDocument();expect(screen.getByRole('heading',{name:'Service Credits'})).toBeInTheDocument();
    expect(screen.queryByText('Assign designation')).not.toBeInTheDocument();expect(screen.getByLabelText('consultation hours progress')).toBeInTheDocument();
  });
  it('shows a picker to management and waits for a faculty selection',async()=>{
    useAuthStore.setState({user:{id:'u',email:'fixture@test.local',role:'CHAIR',facultyId:null}});mount();
    expect(await screen.findByRole('option',{name:'Reyes, Jose'})).toBeInTheDocument();expect(getTeachingLoad).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Teaching load faculty'),{target:{value:'f1'}});
    expect(await screen.findByText('Assign designation')).toBeInTheDocument();
  });
  it('lets the Chair save the consultation target using configured function minimums',async()=>{
    useAuthStore.setState({user:{id:'u',email:'fixture@test.local',role:'CHAIR',facultyId:null}});mount();
    await screen.findByRole('option',{name:'Reyes, Jose'});fireEvent.change(screen.getByLabelText('Teaching load faculty'),{target:{value:'f1'}});await screen.findByText('19.2h');
    fireEvent.change(screen.getByLabelText('Consultation target hours'),{target:{value:'5'}});fireEvent.click(screen.getByRole('button',{name:'Save target'}));
    await waitFor(()=>expect(apiFetch).toHaveBeenCalledWith('/api/faculty/f1/functions?termId=t1',expect.objectContaining({method:'PUT',body:JSON.stringify({research_hours:1,extension_hours:1,imp_hours:0,consultation_hours:5})})));
  });
  it('updates the student grand total immediately and saves one entry per section',async()=>{
    mount();await screen.findByText('19.2h');fireEvent.change(screen.getByLabelText('Students in BSIE 2A'),{target:{value:'20'}});
    expect(screen.getByText('Total students: 50')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Save student counts'}));
    await waitFor(()=>expect(apiFetch).toHaveBeenCalledWith('/api/faculty/f1/students?termId=t1',expect.objectContaining({method:'PUT',body:JSON.stringify({students:[{section_id:'sec1',student_count:30},{section_id:'sec2',student_count:20}]})})));
  });
  it('keeps workload analysis separate and links to the weekly planner',async()=>{
    mount();await screen.findByText('19.2h');expect(screen.getByRole('heading',{name:'Progress toward weekly target'})).toBeInTheDocument();
    expect(screen.getByRole('progressbar',{name:'Weekly target progress'})).toHaveAttribute('aria-valuenow','45');
    expect(screen.getByRole('link',{name:'Open Weekly Function Planner'})).toHaveAttribute('href','/weekly-planner');
    expect(screen.queryByRole('heading',{name:'Weekly function planner'})).not.toBeInTheDocument();
  });
  it('offers retry after a load failure',async()=>{
    vi.mocked(getTeachingLoad).mockRejectedValueOnce(new Error('Failed'));mount();await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Retry'}));expect(await screen.findByText('19.2h')).toBeInTheDocument();
  });
});
