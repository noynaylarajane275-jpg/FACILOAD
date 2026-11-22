import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StudentClassProgramSheet } from './StudentClassProgramSheet';
import type { ProgramForm } from '../lib/program-forms';
import type { ScheduleSlot } from '../lib/schedule-slots';

afterEach(cleanup);
const form: ProgramForm = {
  kind:'sections',entity:{id:'section',name:'1-C (Year 1)',rank:null},term:{id:'term',label:'2nd Sem. S.Y. 2024-2025'},
  settings:{school_lines:'Republic of the Philippines\nPalompon Institute of Technology\nPalompon, Leyte',college_lines:'College of Technology and Engineering',department:'Industrial Technology',program:'BIndTech',major:'Electronics',school_logo_path:'/school-logo.jpg',tuv_logo_path:null},
  template:{type:'STUDENT_CLASS_PROGRAM',title:'STUDENT CLASS PROGRAM',ref_code:'',revision:''},effectivity:{start:null,end:null,source:'TERM'},load:null,signatory_options:[],signatures:[{slot:'PREPARED',name:'Chair Name',title:'Chair',option_id:null}],slots:[],
};
const slot=(overrides:Partial<ScheduleSlot>={}):ScheduleSlot=>({id:'slot-1',day_of_week:'SAT',start_time:'08:00',end_time:'10:00',subject_code:'ELX 12a',faculty_name:'R. Entoma',room_name:'COTE 252',session_type:'LAB',color:'#86bf21',...overrides} as ScheduleSlot);

describe('Student Class Program reference layout',()=>{
  it('prints the six-day grid, real plotted block, metadata and a single prepared signature',()=>{
    const {container}=render(<StudentClassProgramSheet form={{...form,slots:[slot()]}} preparedBy="Chair Name"/>);
    expect(screen.getByText('STUDENT CLASS PROGRAM')).toBeInTheDocument();
    expect(screen.getByText('SATURDAY')).toBeInTheDocument();
    expect(screen.queryByText('Electronics')).not.toBeInTheDocument();
    expect(screen.getByText('1-C (Year 1)')).toBeInTheDocument();
    expect(screen.getAllByText('ELX 12a L')).toHaveLength(1);
    const block=container.querySelector('.student-class-cell');
    expect(block).toHaveAttribute('rowspan','4');
    expect(block).toHaveTextContent('R. Entoma');expect(block).toHaveTextContent('COTE 252');
    expect(container.querySelector('.student-noon-break')).toHaveAttribute('colspan','6');
    expect(container.querySelector('.student-noon-break')).toHaveAttribute('rowspan','2');
    expect(screen.getAllByText('Chair Name')).toHaveLength(1);
  });
  it('preserves a plotted noon class instead of covering it with a break label',()=>{
    const {container}=render(<StudentClassProgramSheet form={{...form,slots:[slot({start_time:'12:00',end_time:'13:00'})]}} preparedBy="Chair Name"/>);
    expect(container.querySelector('.student-noon-break')).toBeNull();
    expect(screen.getByText('ELX 12a L')).toBeInTheDocument();
  });
});
