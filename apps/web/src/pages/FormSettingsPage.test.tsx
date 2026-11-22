import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { FormSettingsPage } from './FormSettingsPage';
import { getFormConfiguration } from '../lib/program-forms';
import { getLoadSettings } from '../lib/teaching-load';
import { apiFetch } from '../lib/api';
import { useTermStore } from '../store/term.store';
import { ToastProvider } from '../components/Toast';
vi.mock('../lib/program-forms',()=>({getFormConfiguration:vi.fn()}));
vi.mock('../lib/teaching-load',()=>({getLoadSettings:vi.fn()}));
vi.mock('../lib/api',()=>({apiFetch:vi.fn(),apiAssetUrl:(value:string)=>value}));
beforeEach(()=>{
  vi.clearAllMocks();
  useTermStore.setState({status:'ready',selectedTermId:'t1',terms:[]});
  vi.mocked(getFormConfiguration).mockResolvedValue({settings:{id:'singleton',school_lines:'School',college_lines:'College',department:'Industrial Engineering',program:'BSIE',school_logo_path:null,tuv_logo_path:null},templates:[],signatories:[]} as never);
  vi.mocked(getLoadSettings).mockResolvedValue({settings:{lab_coefficient:.7,weekly_hours:40,consultation_hours:4,min_research:1,min_extension:1,min_imp:0,min_session_hours:1,prep_tiers:[{minPreps:1,maxPreps:2,ceiling:21}]}});
  vi.mocked(apiFetch).mockResolvedValue({effectivity_start:null,effectivity_end:null});
});
afterEach(cleanup);
describe('Chair form settings',()=>{
  it('saves only editable header fields, excluding singleton database metadata',async()=>{
    render(<ToastProvider><FormSettingsPage/></ToastProvider>);
    fireEvent.change(await screen.findByLabelText('school lines'),{target:{value:'Updated school\nCampus'}});
    fireEvent.click(screen.getByRole('button',{name:'Save header'}));
    await waitFor(()=>expect(apiFetch).toHaveBeenCalledWith('/api/form-settings',expect.objectContaining({method:'PUT',body:JSON.stringify({school_lines:'Updated school\nCampus',college_lines:'College',department:'Industrial Engineering',program:'BSIE',school_logo_path:null,tuv_logo_path:null})})));
  });
  it('rejects unsupported logo files before making an upload request',async()=>{
    render(<ToastProvider><FormSettingsPage/></ToastProvider>);await screen.findByLabelText('school lines');vi.mocked(apiFetch).mockClear();
    fireEvent.change(screen.getByLabelText('tuv logo upload'),{target:{files:[new File(['<svg/>'],'logo.svg',{type:'image/svg+xml'})]}});
    expect(await screen.findByText('Choose a PNG or JPG up to 2MB.')).toBeInTheDocument();expect(apiFetch).not.toHaveBeenCalled();
  });
});
