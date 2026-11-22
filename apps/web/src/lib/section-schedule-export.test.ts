import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { ProgramForm } from './program-forms';
import type { ScheduleSlot } from './schedule-slots';
import { buildSectionScheduleWorkbook } from './section-schedule-export';

const slot = (overrides: Partial<ScheduleSlot> = {}): ScheduleSlot => ({
  id: 'slot', workload_assignment_id: 'assignment', room_id: 'room', room_name: 'Lab 4',
  day_of_week: 'SAT', start_time: '08:00', end_time: '11:00', session_type: 'LAB', session_hours: 3,
  faculty_id: 'faculty', faculty_name: 'Test Instructor', subject_code: 'TEST 101', subject_title: 'Test subject',
  subject_units: 3, section_id: 'section', section_label: 'Test A', term_id: 'term', color: '#12ab34', created_at: '', updated_at: '', ...overrides,
});
const form = (slots: ScheduleSlot[]): ProgramForm => ({
  kind: 'sections', entity: { id: 'section', name: 'Test A (Year 2)', rank: null },
  term: { id: 'term', label: '2026–2027 — 1st Sem' },
  settings: { school_lines: 'Republic\nTest School\nTest City', college_lines: 'Test College', department: 'Test Department', program: 'Test Program', school_logo_path: null, tuv_logo_path: null },
  template: { type: 'STUDENT_CLASS_PROGRAM', title: 'Student Class Program', ref_code: '', revision: '' },
  signatures: [{ slot: 'PREPARED', name: 'Test Chair', title: 'Chair', option_id: null }], signatory_options: [],
  effectivity: { start: null, end: null, source: 'TERM' }, slots, load: null,
});
async function build(slots: ScheduleSlot[]) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildSectionScheduleWorkbook(form(slots)) as never);
  return workbook.worksheets[0];
}
describe('section schedule reference export', () => {
  it('uses actual metadata, six weekdays, half-hour merged classes, colors, noon and prepared footer', async () => {
    const sheet = await build([slot()]);
    expect(sheet.getCell('C1').value).toContain('Test School');
    expect(sheet.getCell('H1').value).toBe('STUDENT CLASS PROGRAM');
    expect(sheet.getCell('H7').value).toContain('Test A (Year 2)');
    expect(sheet.getCell('J8').value).toBe('SATURDAY');
    expect(sheet.getCell('B9').value).toBe('07:30');
    expect(sheet.getCell('J10').value).toBe('TEST 101 L\nTest Instructor\nLab 4');
    expect(sheet.getCell('J10').font.size).toBe(10);
    expect(sheet.getCell('J15').master.address).toBe('J10');
    expect(sheet.getCell('J10').fill).toMatchObject({ fgColor: { argb: 'FF12AB34' } });
    expect(sheet.getCell('E18').value).toBe('N O O N   B R E A K');
    expect(sheet.getCell('A32').value).toContain('Test Chair');
    expect(sheet.pageSetup.printArea).toBe('A1:J35');
    expect(sheet.pageSetup.fitToHeight).toBe(1);
  });
  it('retains noon and late classes without a break band concealing them', async () => {
    const sheet = await build([slot({ start_time: '12:00', end_time: '13:00' }), slot({ id: 'late', day_of_week: 'MON', start_time: '19:00', end_time: '20:00' })]);
    expect(sheet.getCell('J18').value).toContain('TEST 101 L');
    expect(sheet.getCell('E32').value).toContain('TEST 101 L');
    expect(sheet.getCell('E18').value).toBe('');
  });
  it('exports a blank schedule and rejects overlapping or off-grid classes explicitly', async () => {
    expect((await build([])).getCell('J8').value).toBe('SATURDAY');
    await expect(build([slot(), slot({ id: 'overlap' })])).rejects.toThrow('overlapping');
    await expect(build([slot({ start_time: '08:15' })])).rejects.toThrow('half-hour');
  });
  it('keeps lecture labels plain and reduces long short-block text while filling the printable page', async () => {
    const sheet = await build([slot({ session_type: 'LECTURE', end_time: '08:30', subject_title: 'A particularly long subject name for a short teaching period', faculty_name: 'An instructor with a particularly long full name' })]);
    expect(sheet.getCell('J10').value).toBe('TEST 101\nAn instructor with a particularly long full name\nLab 4');
    expect(sheet.getCell('J10').font.size).toBeLessThan(10);
    expect(sheet.getRow(10).height).toBeGreaterThan(22);
    const height = Array.from({ length: 35 }, (_, i) => sheet.getRow(i + 1).height ?? 21).reduce((sum, value) => sum + value, 0);
    const width = sheet.columns.reduce((sum, col) => sum + ((col.width ?? 8) * 7 + 5) * 0.75, 0);
    expect(height / width).toBeCloseTo((11.69 - 0.6) / (8.27 - 0.5), 2);
    expect(sheet.pageSetup.margins).toMatchObject({ left: 0.25, right: 0.25, top: 0.3, bottom: 0.3 });
  });
});
