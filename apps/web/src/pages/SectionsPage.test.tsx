import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/Toast';
import { apiFetch } from '../lib/api';
import type { Section } from '../lib/sections';
import { SECTION_CHANGE_KEY } from '../lib/section-events';
import { navItemsForRole } from '../config/navigation';
import { SectionsPage } from './SectionsPage';
import { useTermStore } from '../store/term.store';

vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }));
let rows: Section[];
const section = (name: string, year_level = 1): Section => ({ id: 'section-1', name, year_level, label: `${name} (Year ${year_level})`, created_at: '', updated_at: '' });
function renderPage(): void { render(<MemoryRouter><ToastProvider><SectionsPage /></ToastProvider></MemoryRouter>); }

beforeEach(() => {
  vi.clearAllMocks();
  useTermStore.setState({status:'ready',selectedTermId:'term-1',terms:[{id:'term-1',label:'2026-2027 First',school_year:'2026-2027',semester:'FIRST',is_active:true,created_at:''}]});
  rows = [];
  vi.mocked(apiFetch).mockImplementation(async (path, options) => {
    if (options?.method === 'POST') {
      const input = JSON.parse(options.body as string);
      rows.push(section(input.name, input.year_level));
      return { section: rows[0] } as never;
    }
    if (options?.method === 'PATCH') {
      const input = JSON.parse(options.body as string);
      rows = [section(input.name, input.year_level)];
      return { section: rows[0] } as never;
    }
    if (options?.method === 'DELETE') { rows = []; return undefined as never; }
    return { data: [...rows], meta: { total: rows.length } } as never;
  });
});
afterEach(cleanup);

describe('Section management', () => {
  it('adds, edits the same record, and deletes it with confirmation', async () => {
    renderPage();
    await screen.findByText(/No sections yet/);
    fireEvent.click(screen.getByRole('button', { name: 'Add section' }));
    let dialog = screen.getByRole('dialog', { name: 'Add section' });
    fireEvent.change(within(dialog).getByLabelText('Section name'), { target: { value: 'BSIT 1A' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add section' }));
    expect(await screen.findByText('BSIT 1A (Year 1)')).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Print schedule for BSIT 1A'})).toHaveAttribute('href','/print/sections/section-1?termId=term-1');
    fireEvent.click(screen.getByRole('button', { name: 'Edit BSIT 1A' }));
    dialog = screen.getByRole('dialog', { name: 'Edit section' });
    fireEvent.change(within(dialog).getByLabelText('Section name'), { target: { value: 'BSIT 2B' } });
    fireEvent.change(within(dialog).getByLabelText('Year level'), { target: { value: '2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('BSIT 2B (Year 2)')).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith('/api/sections/section-1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'BSIT 2B', year_level: 2 }) }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete BSIT 2B' }));
    dialog = screen.getByRole('dialog', { name: 'Delete section?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete section' }));
    await waitFor(() => expect(screen.queryByText('BSIT 2B (Year 2)')).not.toBeInTheDocument());
    expect(apiFetch).toHaveBeenCalledWith('/api/sections/section-1', { method: 'DELETE' });
  });

  it('refreshes shared section values after an update in another tab', async () => {
    rows = [section('BSIT 1A')];
    renderPage();
    await screen.findByText('BSIT 1A (Year 1)');
    rows = [section('BSIT 1B')];
    fireEvent(window, new StorageEvent('storage', { key: SECTION_CHANGE_KEY, newValue: 'updated' }));
    expect(await screen.findByText('BSIT 1B (Year 1)')).toBeInTheDocument();
    expect(screen.queryByText('BSIT 1A (Year 1)')).not.toBeInTheDocument();
  });

  it('keeps a linked section visible and explains why deletion was refused', async () => {
    rows = [section('BSIT 1A')];
    renderPage();
    await screen.findByText('BSIT 1A (Year 1)');
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('This section is linked to workload assignments and cannot be deleted.'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete BSIT 1A' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete section?' })).getByRole('button', { name: 'Delete section' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('linked to workload assignments');
    expect(screen.getByText('BSIT 1A (Year 1)')).toBeInTheDocument();
  });

  it('exposes Sections only in the management sidebar', () => {
    expect(navItemsForRole('CHAIR').some(item => item.path === '/sections')).toBe(true);
    expect(navItemsForRole('FACULTY').some(item => item.path === '/sections')).toBe(false);
  });
});
