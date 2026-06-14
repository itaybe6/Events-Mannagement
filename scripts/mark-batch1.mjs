/**
 * Mark batch-1 WhatsApp recipients as "message sent":
 *  - set guests.sms_invitation_sent_at / count / last_send_id
 *  - create one scheduled_notification_sms_runs row
 *  - insert scheduled_notification_sms_run_recipients rows (status='sent')
 *    -> this is what drives the "הודעה נשלחה" badge in the app.
 *
 * Reads guest ids from idan-batch1-guest-ids.txt (ground-truth = actually sent).
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

function readEnvFile() {
  const raw = readFileSync(join(projectRoot, '.env'), 'utf8');
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const env = readEnvFile();
const SUPABASE_URL = 'https://cxlmixykahuchilhyjjv.supabase.co';
const SERVICE_KEY = env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY;
const EVENT_ID = '3b654ff7-38c3-4f85-9e37-17e5c8427827';
const SETTING_ID = '6069117c-be23-4a63-b134-eddf27cf9359';
const SEND_ID = 'whatsapp-idan-batch1';

const H = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

const ids = readFileSync(join(projectRoot, 'idan-batch1-guest-ids.txt'), 'utf8')
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean);

const chunk = (a, n) => {
  const o = [];
  for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n));
  return o;
};

async function req(method, path, { body, headers } = {}) {
  const resp = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: { ...H, ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`${method} ${path} -> ${resp.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

console.log(`Marking ${ids.length} guests...`);

// 1) Create run
const run = await req('POST', '/rest/v1/scheduled_notification_sms_runs', {
  headers: { Prefer: 'return=representation' },
  body: [
    {
      notification_setting_id: SETTING_ID,
      event_id: EVENT_ID,
      notification_type: 'reminder_1',
      scheduled_for: new Date().toISOString(),
      status: 'sent',
      result: { channel: 'whatsapp', template: 'event_invitation', batch: 1, sent: ids.length },
    },
  ],
});
const runId = run[0].id;
console.log(`Created run ${runId}`);

// 2) Fetch phones for these guests
const idToPhone = new Map();
for (const c of chunk(ids, 100)) {
  const rows = await req(
    'GET',
    `/rest/v1/guests?select=id,phone&id=in.(${c.join(',')})`,
  );
  for (const r of rows) idToPhone.set(r.id, r.phone ?? null);
}

// 3) Mark guests as sent
const nowIso = new Date().toISOString();
let marked = 0;
for (const c of chunk(ids, 100)) {
  await req('PATCH', `/rest/v1/guests?id=in.(${c.join(',')})`, {
    headers: { Prefer: 'return=minimal' },
    body: {
      sms_invitation_sent_at: nowIso,
      sms_invitation_sent_count: 1,
      sms_invitation_last_send_id: SEND_ID,
    },
  });
  marked += c.length;
}
console.log(`Updated sms_invitation_sent_at on ${marked} guests`);

// 4) Insert recipient rows (drives the "sent" badge)
let inserted = 0;
for (const c of chunk(ids, 100)) {
  const rows = c.map((id) => ({
    run_id: runId,
    event_id: EVENT_ID,
    guest_id: id,
    status: 'sent',
    phone: idToPhone.get(id) ?? null,
    sent_at: nowIso,
  }));
  await req('POST', '/rest/v1/scheduled_notification_sms_run_recipients', {
    headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' },
    body: rows,
  });
  inserted += rows.length;
}
console.log(`Inserted ${inserted} recipient rows (status=sent)`);
console.log('Done.');
