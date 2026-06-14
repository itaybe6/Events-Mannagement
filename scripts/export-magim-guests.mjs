import XLSX from 'xlsx';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const EVENT_ID = '534f0271-1255-44fd-a809-17e87ffc0539';
const SUPABASE_URL = 'https://cxlmixykahuchilhyjjv.supabase.co';
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4bG1peHlrYWh1Y2hpbGh5amp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDE5MjExOCwiZXhwIjoyMDg1NzY4MTE4fQ.v4b1cGRJiO3cR54UKkz1dQ34iTZBq3D-X90d_3iN9Cc';

const url =
  `${SUPABASE_URL}/rest/v1/guests?select=name,phone` +
  `&event_id=eq.${EVENT_ID}` +
  `&status=eq.${encodeURIComponent('מגיע')}` +
  `&phone=not.is.null` +
  `&order=name.asc`;

const resp = await fetch(url, {
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
  },
});

if (!resp.ok) {
  console.error('Failed to fetch guests:', resp.status, await resp.text());
  process.exit(1);
}

const guests = await resp.json();
const rows = [
  ['שם', 'טלפון'],
  ...guests
    .filter((g) => String(g.phone ?? '').trim())
    .map((g) => [String(g.name ?? '').trim(), String(g.phone ?? '').trim()]),
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(rows);
ws['!cols'] = [{ wch: 35 }, { wch: 18 }];
XLSX.utils.book_append_sheet(wb, ws, 'מגיעים');

const outPath = join(projectRoot, 'ilanit-asayag-confirmed-guests.xlsx');
XLSX.writeFile(wb, outPath);

const check = XLSX.readFile(outPath);
const firstSheet = check.Sheets[check.SheetNames[0]];
const checkRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

console.log(`Created ${outPath} with ${rows.length - 1} guests`);
console.log(`Verified workbook can be read, rows: ${checkRows.length - 1}`);
