import type { ProgramForm } from './program-forms';
import { apiAssetUrl } from './api';
import { loadLogoFromUrl } from './schedule-export';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const LABELS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const clock = (time: number) => `${String(Math.floor(time / 60) % 12 || 12).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}`;

/** Student class program: the reference's form layout populated from live section data. */
export async function buildSectionScheduleWorkbook(form: ProgramForm): Promise<Uint8Array> {
  const module = await import('exceljs');
  const ExcelJS = module.default ?? module;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FlowSched';
  const ws = wb.addWorksheet('Student Class Program', { properties: { defaultRowHeight: 21 } });
  ws.columns = [{ width: 4 }, { width: 8 }, { width: 2.5 }, { width: 8 }, ...DAYS.map(() => ({ width: 16 }))];
  const rule = { style: 'thin' as const, color: { argb: 'FF222222' } };
  function box(top: number, left: number, bottom: number, right: number, value: string, fill?: string) {
    if (top !== bottom || left !== right) ws.mergeCells(top, left, bottom, right);
    const cell = ws.getCell(top, left);
    cell.value = value;
    cell.font = { name: 'Arial', size: 11, color: { argb: 'FF000000' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { top: rule, bottom: rule, left: rule, right: rule };
    if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    return cell;
  }
  box(1, 1, 4, 2, '');
  box(1, 3, 4, 7, form.settings.school_lines).font = { name: 'Arial', size: 14, bold: true };
  box(1, 8, 2, 10, 'STUDENT CLASS PROGRAM').font = { name: 'Arial', size: 16, bold: true };
  box(3, 8, 4, 10, form.term.label).font = { name: 'Arial', size: 14, bold: true };
  box(5, 1, 5, 2, 'College:'); box(5, 3, 5, 7, form.settings.college_lines);
  box(6, 1, 6, 2, 'Department:'); box(6, 3, 6, 7, form.settings.department);
  box(5, 8, 5, 10, `Program: ${form.settings.program}`);
  // Major is not stored separately; leave the field available rather than inventing a value.
  box(6, 8, 6, 10, 'Major:');
  box(7, 1, 7, 7, ''); box(7, 8, 7, 10, `Yr/Sec: ${form.entity.name}`);
  box(8, 1, 8, 4, 'TIME', 'FFA9CA78');
  LABELS.forEach((day, i) => box(8, i + 5, 8, i + 5, day, 'FFA9CA78'));
  const slots = form.slots;
  for (const slot of slots) {
    if (!DAYS.includes(slot.day_of_week) || !Number.isFinite(minutes(slot.start_time)) || !Number.isFinite(minutes(slot.end_time)) || minutes(slot.end_time) <= minutes(slot.start_time)) {
      throw new Error('The section contains an invalid schedule time. Review its schedule before exporting.');
    }
  }
  const start = Math.floor(Math.min(450, ...slots.map(s => minutes(s.start_time))) / 30) * 30;
  const end = Math.ceil(Math.max(1140, ...slots.map(s => minutes(s.end_time))) / 30) * 30;
  const rowAt = (time: number) => 9 + (time - start) / 30;
  const last = rowAt(end) - 1;
  // Match the sheet's aspect ratio to the printable A4 area. Excel's one-page
  // scaling then fills both dimensions instead of leaving a short, tiny table.
  const sheetWidthPoints = ws.columns.reduce((sum, column) => sum + ((column.width ?? 8) * 7 + 5) * 0.75, 0);
  const printableHeight = sheetWidthPoints * ((11.69 - 0.6) / (8.27 - 0.5));
  const gridRowHeight = (printableHeight - (4 * 21 + 3 * 22 + 24 + 4 * 18)) / ((end - start) / 30);
  for (let row = 5; row <= 7; row++) ws.getRow(row).height = 22;
  ws.getRow(8).height = 24;
  LABELS.forEach((_, i) => { ws.getCell(8, i + 5).font = { name: 'Arial', size: 10, bold: true }; });
  for (let time = start; time < end; time += 30) {
    const row = rowAt(time);
    box(row, 2, row, 2, clock(time)); box(row, 3, row, 3, '-'); box(row, 4, row, 4, clock(time + 30));
    for (let col = 5; col <= 10; col++) box(row, col, row, col, '');
    ws.getRow(row).height = gridRowHeight;
  }
  if (start < 720) box(9, 1, rowAt(720) - 1, 1, 'A.\nM.');
  box(rowAt(720), 1, last, 1, 'P.\nM.');
  const lunchFree = !slots.some(s => minutes(s.start_time) < 780 && minutes(s.end_time) > 720);
  if (lunchFree) box(rowAt(720), 5, rowAt(780) - 1, 10, 'N O O N   B R E A K');
  // Reject overlaps explicitly instead of silently overwriting a class.
  for (const day of DAYS) {
    const daySlots = slots.filter(s => s.day_of_week === day).sort((a, b) => a.start_time.localeCompare(b.start_time));
    for (let i = 0; i < daySlots.length; i++) {
      const slot = daySlots[i];
      if (daySlots.slice(0, i).some(other => minutes(other.end_time) > minutes(slot.start_time))) {
        throw new Error('This section has overlapping classes. Resolve the overlap before exporting its timetable.');
      }
      if (minutes(slot.start_time) % 30 || minutes(slot.end_time) % 30) throw new Error('Section export requires half-hour schedule boundaries. Review the section schedule.');
      const fill = /^#[0-9a-f]{6}$/i.test(slot.color ?? '') ? `FF${slot.color!.slice(1).toUpperCase()}` : 'FFE2EFDA';
      const lines = [`${slot.subject_code}${slot.session_type === 'LAB' ? ' L' : ''}`, slot.faculty_name, slot.room_name ?? 'Room TBA'];
      const block = box(rowAt(minutes(slot.start_time)), DAYS.indexOf(day) + 5, rowAt(minutes(slot.end_time)) - 1, DAYS.indexOf(day) + 5, lines.join('\n'), fill);
      const height = (minutes(slot.end_time) - minutes(slot.start_time)) / 30 * gridRowHeight;
      // Size each block independently: a long name in a short class must not
      // determine the font of every other class. Include room/instructor wraps.
      let size = 10;
      const width = (16 * 7 + 5) * 0.75 - 12;
      const lineCount = (fontSize: number) => lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length * fontSize * 0.56 / width)), 0);
      while (size > 6 && lineCount(size) * size * 1.3 + 10 > height) size -= 0.5;
      block.font = { name: 'Arial', size, color: { argb: 'FF000000' } };
      block.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, indent: 0 };
    }
  }
  const prepared = form.signatures.find(s => s.slot === 'PREPARED');
  box(last + 1, 1, last + 4, 10, `Prepared by:\n\n${prepared?.name ?? ''}${prepared?.title ? `\n${prepared.title}` : ''}`).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  for (let row = last + 1; row <= last + 4; row++) ws.getRow(row).height = 18;
  const logo = await loadLogoFromUrl(apiAssetUrl(form.settings.school_logo_path));
  if (logo) {
    const id = wb.addImage({ base64: logo.base64, extension: logo.extension });
    ws.addImage(id, { tl: { col: 0.25, row: 0.2 }, ext: { width: 80, height: 80 } });
  }
  ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.3, header: 0, footer: 0 }, printArea: `A1:J${last + 4}`, horizontalCentered: true };
  return new Uint8Array(await wb.xlsx.writeBuffer() as ArrayBuffer);
}
