import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { cleanup,fireEvent,render,screen } from '@testing-library/react';
import { MemoryRouter,Route,Routes } from 'react-router-dom';
import { ProgramPrintPage,layoutProgramBlocks } from './ProgramPrintPage';
import { getProgramForm,type ProgramForm } from '../lib/program-forms';
vi.mock('../lib/program-forms',()=>({getProgramForm:vi.fn()}));
const form:ProgramForm={kind:'faculty',entity:{id:'f1',name:'Jose Reyes',rank:'Instructor I'},term:{id:'t1',label:'2026–2027 Second Semester'},settings:{school_lines:'Republic of the Philippines\nPALOMPON INSTITUTE OF TECHNOLOGY',college_lines:'College of Technology and Engineering',department:'Industrial Engineering',program:'BSIE',school_logo_path:'/school-logo.jpg',tuv_logo_path:null},template:{type:'FACULTY_CLASS_PROGRAM',title:'FACULTY CLASS PROGRAM',ref_code:'PIT-COTE-FOR-3-2-01B',revision:'00'},effectivity:{start:'2026-11-01',end:'2027-03-31',source:'TERM'},slots:[],load:null,signatory_options:[{id:'p',slot:'PREPARED',name:'Dearielyn C. Maskarino',title:'Chairman',active:true},{id:'r',slot:'REVIEWED',name:'Ronald B. Lacaba',title:'Dean',active:true},{id:'a',slot:'APPROVED',name:'Jennifer A. Gorumba',title:'VP Academic Affairs',active:true}],signatures:[{slot:'PREPARED',option_id:'p',name:'Dearielyn C. Maskarino',title:'Chairman'},{slot:'REVIEWED',option_id:'r',name:'Ronald B. Lacaba',title:'Dean'},{slot:'APPROVED',option_id:'a',name:'Jennifer A. Gorumba',title:'VP Academic Affairs'}]};
form.signatory_options.splice(2,0,{id:'v',slot:'VERIFIED',name:'Verifier',title:'Dean, COTE',active:true});
form.signatures.splice(2,0,{slot:'VERIFIED',option_id:'v',name:'Verifier',title:'Dean, COTE'});
beforeEach(()=>{vi.clearAllMocks();vi.mocked(getProgramForm).mockResolvedValue(form);vi.spyOn(window,'print').mockImplementation(()=>{});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const mount=()=>render(<MemoryRouter initialEntries={['/print/faculty/f1?termId=t1']}><Routes><Route path="/print/:kind/:id" element={<ProgramPrintPage/>}/></Routes></MemoryRouter>);
describe('department program print',()=>{
  it('keeps overridden overlaps in separate lanes and adjacent blocks in a single lane',()=>{
    const blocks=layoutProgramBlocks([{day:'MON',start:'07:00',end:'09:00'},{day:'MON',start:'08:00',end:'10:00'},{day:'MON',start:'10:00',end:'11:00'}]);
    expect(blocks.map(({lane,lanes})=>[lane,lanes])).toEqual([[0,2],[1,2],[0,1]]);
  });
  it('renders the shared header, full weekday grid, term and four signatory selectors',async()=>{
    mount();await screen.findByText('Jose Reyes');expect(screen.getByText(/Ref\. Code\s*:\s*PIT-COTE-FOR-3-2-01B/)).toBeInTheDocument();
    expect(screen.getByText(/Rev\. No\.\s*:\s*00/)).toBeInTheDocument();
    expect(document.querySelector('.frh-fields')?.textContent).toContain(form.term.label);expect(screen.getByText('Instructor I')).toBeInTheDocument();
    for(const day of ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'])expect(screen.getByText(day)).toBeInTheDocument();
    for(const slot of ['PREPARED','REVIEWED','VERIFIED','APPROVED'])expect(screen.getByLabelText(`${slot} signatory`)).toBeInTheDocument();
    expect(document.body).toHaveClass('printing-program');fireEvent.click(screen.getByRole('button',{name:'Print program'}));expect(window.print).toHaveBeenCalledOnce();
  });
  it('uses a custom name for this print without persisting or reloading the server configuration',async()=>{
    mount();await screen.findByText('Jose Reyes');fireEvent.change(screen.getByLabelText('PREPARED signatory'),{target:{value:'custom'}});
    fireEvent.change(screen.getByLabelText('PREPARED custom name'),{target:{value:'Print Only Name'}});expect(screen.getByText('Print Only Name')).toBeInTheDocument();expect(getProgramForm).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText('PREPARED custom name'),{target:{value:''}});expect(screen.getByRole('button',{name:'Print program'})).toBeDisabled();
  });
});
