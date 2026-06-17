/**
 * Send WhatsApp "event_invitation" template messages to guests.
 *
 * Event: חתונה של עידן וטליה (event_id: 3b654ff7-38c3-4f85-9e37-17e5c8427827)
 *
 * Template (approved, language "en"):
 *   HEADER  -> IMAGE  (per-send image link required)
 *   BODY    -> "משפחה וחברים יקרים,\n{{1}}\nנשמח לראותכם!"  (1 text param: the invitation text)
 *   BUTTON  -> URL  https://events-mannagement.vercel.app/i/{{1}}  (1 param: the guest invitation_code)
 *
 * Usage (PowerShell):
 *   $env:WA_TOKEN="<your token>"
 *   node scripts/send-whatsapp-invitations.mjs test
 *   node scripts/send-whatsapp-invitations.mjs live
 *
 * Optional flags:
 *   --dry-run        Build + print payloads, do NOT call the API
 *   --limit=N        (live) only send to first N guests
 *   --from=N         (live) start at guest index N (0-based, for resuming)
 *   --status=מגיע    (live) only send to guests with this status (default: all)
 *   --pending-only   (live) only guests with status "ממתין"
 *   --unsent-only    (live) skip guests already marked invitation-sent (no double sends)
 *   --mark-sent      (live) mark each successful recipient as "invitation sent"
 *   --extra=05x,...  (live) also send to these raw numbers first (sample link, no DB update)
 *   --delay=300      ms delay between sends (default 350)
 *
 * Tomorrow's next batch example:
 *   node scripts/send-whatsapp-invitations.mjs live --pending-only --unsent-only --limit=250 --mark-sent
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const GRAPH_VERSION = 'v23.0';
const PHONE_NUMBER_ID = '1180631841797088';
const TEMPLATE_NAME = 'event_invitation';
const TEMPLATE_LANG = 'en';

const SUPABASE_URL = 'https://cxlmixykahuchilhyjjv.supabase.co';

// Test recipients (the script picks one real guest's invitation_code as the link).
const TEST_NUMBERS = ['0502307500', '0527488779'];

// Per-event configuration. Select with --event=<slug> (default: idan).
//   eventId               -> guests source
//   notificationSettingId -> required only for --mark-sent (badge rows); null = badge skipped
//   headerImageUrl        -> public image shown at top of the WhatsApp message
//   bodyText              -> the {{1}} body parameter (the invitation details)
const EVENTS = {
  idan: {
    eventId: '3b654ff7-38c3-4f85-9e37-17e5c8427827',
    notificationSettingId: '6069117c-be23-4a63-b134-eddf27cf9359',
    headerImageUrl:
      'https://cxlmixykahuchilhyjjv.supabase.co/storage/v1/object/public/event-images/invitations/3b654ff7-38c3-4f85-9e37-17e5c8427827/1781008249893.jpg',
    bodyText:
      'הוזמנתם לחתונה של עידן וטליה ב-"אולמי סופיה" בתאריך 30/06/26 בשעה 19:30. הורי החתן: מקסים וניקול רביבו הורי הכלה: קובי וגלית כלפון נא לאשר הגעה או אי הגעה על ידי לחיצה על "עדכון הגעה"',
  },
  chen: {
    eventId: '3dfb0e62-3c74-4832-be0a-12675601c139',
    notificationSettingId: null,
    headerImageUrl:
      'https://cxlmixykahuchilhyjjv.supabase.co/storage/v1/object/public/event-images/invitations/3dfb0e62-3c74-4832-be0a-12675601c139/1781601240816.jpg',
    // WhatsApp rejects new-lines in body params, so this is one continuous line (like the idan template).
    bodyText:
      'הוזמנתם לחתונה של מוריאל וחן ב-"אולמי סופיה" בתאריך 01/07/26 בשעה 19:30. הורי החתן: אוסנת פיטוסי ושרלי אדרי הורי הכלה: שוש ומוטי בן חמו נא לאשר הגעה או אי הגעה על ידי לחיצה על "עדכון הגעה"',
  },
};

const EVENT_SLUG = (() => {
  const a = process.argv.slice(2).find((x) => x.startsWith('--event='));
  return a ? a.split('=')[1] : 'idan';
})();
const EVENT_CFG = EVENTS[EVENT_SLUG];
if (!EVENT_CFG) {
  console.error(`Unknown --event "${EVENT_SLUG}". Known: ${Object.keys(EVENTS).join(', ')}`);
  process.exit(1);
}

const EVENT_ID = EVENT_CFG.eventId;
const NOTIFICATION_SETTING_ID = EVENT_CFG.notificationSettingId;
const HEADER_IMAGE_URL = EVENT_CFG.headerImageUrl;
const BODY_TEXT = EVENT_CFG.bodyText;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function readEnvFile() {
  try {
    const raw = readFileSync(join(projectRoot, '.env'), 'utf8');
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2];
    }
    return out;
  } catch {
    return {};
  }
}

const env = readEnvFile();
const WA_TOKEN = (process.env.WA_TOKEN || '').trim();
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY || env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY || '').trim();

if (!WA_TOKEN) {
  console.error('Missing WA_TOKEN. Set it first, e.g.:\n  $env:WA_TOKEN="<token>"');
  process.exit(1);
}
if (!SERVICE_KEY) {
  console.error('Missing Supabase service key (SUPABASE_SERVICE_KEY or .env EXPO_PUBLIC_SUPABASE_SERVICE_KEY).');
  process.exit(1);
}

function parseArgs(argv) {
  const out = { mode: argv[0] && !argv[0].startsWith('--') ? argv[0] : 'test', flags: {} };
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      out.flags[k] = v === undefined ? true : v;
    }
  }
  return out;
}

/** Normalize an Israeli phone number to WhatsApp wa_id (E.164 digits, no +). */
function normalizeToWa(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('972')) return d;
  if (d.startsWith('00972')) return d.slice(2);
  if (d.startsWith('0')) return '972' + d.slice(1);
  if (d.length === 9 && d.startsWith('5')) return '972' + d;
  return d;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchGuests({ status, unsentOnly } = {}) {
  let url =
    `${SUPABASE_URL}/rest/v1/guests?select=id,name,phone,status,invitation_code,invitation_token` +
    `&event_id=eq.${EVENT_ID}` +
    `&phone=not.is.null` +
    `&order=name.asc`;
  if (status) url += `&status=eq.${encodeURIComponent(status)}`;
  // Skip guests we already sent the invitation to (so daily batches don't overlap).
  if (unsentOnly) url += `&sms_invitation_sent_at=is.null`;

  const resp = await fetch(url, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!resp.ok) {
    throw new Error(`Failed to fetch guests: ${resp.status} ${await resp.text()}`);
  }
  return resp.json();
}

const SB_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

/** Mark a single guest as "invitation sent" (drives app logic + dedup). */
async function markGuestSent(guestId, sendId) {
  const url = `${SUPABASE_URL}/rest/v1/guests?id=eq.${encodeURIComponent(guestId)}`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: { ...SB_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify({
      sms_invitation_sent_at: new Date().toISOString(),
      sms_invitation_sent_count: 1,
      sms_invitation_last_send_id: sendId,
    }),
  });
  if (!resp.ok) throw new Error(`mark sent failed: ${resp.status} ${await resp.text()}`);
}

/** Create a run row so recipient "sent" rows are valid; returns run id. */
async function createSentRun(sentCount) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/scheduled_notification_sms_runs`, {
    method: 'POST',
    headers: { ...SB_HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify([
      {
        notification_setting_id: NOTIFICATION_SETTING_ID,
        event_id: EVENT_ID,
        notification_type: 'reminder_1',
        scheduled_for: new Date().toISOString(),
        status: 'sent',
        result: { channel: 'whatsapp', template: TEMPLATE_NAME, sent: sentCount },
      },
    ]),
  });
  if (!resp.ok) throw new Error(`create run failed: ${resp.status} ${await resp.text()}`);
  const rows = await resp.json();
  return rows[0].id;
}

/** Insert per-guest "sent" rows -> drives the "הודעה נשלחה" badge in the app. */
async function insertSentRecipients(runId, sentGuests) {
  const nowIso = new Date().toISOString();
  const rows = sentGuests.map((g) => ({
    run_id: runId,
    event_id: EVENT_ID,
    guest_id: g.id,
    status: 'sent',
    phone: g.phone ?? null,
    sent_at: nowIso,
  }));
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/scheduled_notification_sms_run_recipients`,
      {
        method: 'POST',
        headers: { ...SB_HEADERS, Prefer: 'return=minimal,resolution=ignore-duplicates' },
        body: JSON.stringify(batch),
      },
    );
    if (!resp.ok) throw new Error(`insert recipients failed: ${resp.status} ${await resp.text()}`);
  }
}

function buildPayload(toWa, invitationCode) {
  return {
    messaging_product: 'whatsapp',
    to: toWa,
    type: 'template',
    template: {
      name: TEMPLATE_NAME,
      language: { code: TEMPLATE_LANG },
      components: [
        {
          type: 'header',
          parameters: [{ type: 'image', image: { link: HEADER_IMAGE_URL } }],
        },
        {
          type: 'body',
          parameters: [{ type: 'text', text: BODY_TEXT }],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: invitationCode }],
        },
      ],
    },
  };
}

async function sendTemplate(toWa, invitationCode, { dryRun } = {}) {
  const payload = buildPayload(toWa, invitationCode);
  if (dryRun) {
    return { ok: true, dryRun: true, payload };
  }
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, body };
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------
async function runTest({ dryRun, numbers }) {
  const guests = await fetchGuests();
  const sample = guests.find((g) => String(g.invitation_code || '').trim());
  if (!sample) {
    console.error('No guest with an invitation_code found to use for the test.');
    process.exit(1);
  }
  const code = String(sample.invitation_code).trim();
  const list = Array.isArray(numbers) && numbers.length ? numbers : TEST_NUMBERS;
  console.log(`Event: ${EVENT_SLUG} (${EVENT_ID})`);
  console.log(`Using sample guest "${sample.name}" → link https://events-mannagement.vercel.app/i/${code}\n`);

  for (const raw of list) {
    const wa = normalizeToWa(raw);
    process.stdout.write(`→ ${raw}  (${wa})  ... `);
    try {
      const res = await sendTemplate(wa, code, { dryRun });
      if (res.dryRun) {
        console.log('DRY RUN');
        console.log(JSON.stringify(res.payload, null, 2));
      } else if (res.ok) {
        const id = res.body?.messages?.[0]?.id || '(no id)';
        console.log(`OK  message_id=${id}`);
      } else {
        console.log(`FAILED  http=${res.status}`);
        console.log(JSON.stringify(res.body, null, 2));
      }
    } catch (e) {
      console.log(`ERROR  ${e.message}`);
    }
    await sleep(800);
  }
}

async function runLive({ dryRun, limit, from, status, delay, mark, extra, unsentOnly }) {
  let guests = await fetchGuests({ status, unsentOnly });
  guests = guests.filter((g) => String(g.invitation_code || '').trim() && normalizeToWa(g.phone));
  const start = Number.isFinite(from) ? from : 0;
  const slice = guests.slice(start, limit ? start + limit : undefined);

  const sampleCode = String(guests[0]?.invitation_code || '').trim();
  const sendId = `whatsapp-${Date.now().toString(36)}`;

  console.log(
    `Live send: ${slice.length} guests (of ${guests.length} eligible)` +
      `${status ? `, status="${status}"` : ''}${unsentOnly ? ', unsent-only' : ''}` +
      `${mark ? ', mark-sent' : ''}${dryRun ? '  [DRY RUN]' : ''}\n`,
  );

  let sent = 0;
  let failed = 0;
  const failures = [];
  const sentGuests = [];

  // Extra (non-guest) recipients first, e.g. the event manager who wants to preview.
  const extraNums = Array.isArray(extra) ? extra : [];
  for (const raw of extraNums) {
    const wa = normalizeToWa(raw);
    process.stdout.write(`[extra] ${raw} (${wa}) ... `);
    try {
      const res = await sendTemplate(wa, sampleCode, { dryRun });
      if (res.dryRun) console.log('DRY RUN');
      else if (res.ok) console.log(`OK ${res.body?.messages?.[0]?.id || ''}`);
      else {
        const err = res.body?.error;
        console.log(`FAILED http=${res.status} ${err?.code || ''} ${err?.message || ''}`);
      }
    } catch (e) {
      console.log(`ERROR ${e.message}`);
    }
    if (!dryRun) await sleep(delay);
  }

  for (let i = 0; i < slice.length; i++) {
    const g = slice[i];
    const wa = normalizeToWa(g.phone);
    const code = String(g.invitation_code).trim();
    const idx = start + i + 1;
    process.stdout.write(`[${idx}/${guests.length}] ${g.name} (${wa}) ... `);
    try {
      const res = await sendTemplate(wa, code, { dryRun });
      if (res.dryRun) {
        console.log('DRY RUN');
      } else if (res.ok) {
        sent++;
        let markNote = '';
        if (mark) {
          try {
            await markGuestSent(g.id, sendId);
            sentGuests.push({ id: g.id, phone: wa });
            markNote = ' | marked sent';
          } catch (e) {
            markNote = ` | MARK FAILED: ${e.message}`;
          }
        }
        console.log(`OK ${res.body?.messages?.[0]?.id || ''}${markNote}`);
      } else {
        failed++;
        const err = res.body?.error;
        failures.push({ name: g.name, phone: wa, status: res.status, error: err });
        console.log(`FAILED http=${res.status} ${err?.code || ''} ${err?.message || ''}`);
      }
    } catch (e) {
      failed++;
      failures.push({ name: g.name, phone: wa, error: e.message });
      console.log(`ERROR ${e.message}`);
    }
    if (!dryRun) await sleep(delay);
  }

  // Record a "sent" run + per-guest recipient rows so the app shows "הודעה נשלחה".
  if (mark && !dryRun && sentGuests.length) {
    if (!NOTIFICATION_SETTING_ID) {
      console.log(
        `\nNote: no notificationSettingId for event "${EVENT_SLUG}" — guests marked (sms_invitation_sent_at) but badge rows skipped.`,
      );
    } else {
      try {
        const runId = await createSentRun(sentGuests.length);
        await insertSentRecipients(runId, sentGuests);
        console.log(`\nRecorded ${sentGuests.length} 'sent' recipient rows (run ${runId}).`);
      } catch (e) {
        console.log(`\nWARNING: failed to record run/recipient rows: ${e.message}`);
      }
    }
  }

  console.log(`\nDone. sent=${sent} failed=${failed}`);
  if (failures.length) {
    console.log('\nFailures:');
    console.log(JSON.stringify(failures, null, 2));
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const { mode, flags } = parseArgs(process.argv.slice(2));
const opts = {
  dryRun: Boolean(flags['dry-run']),
  limit: flags.limit ? Number(flags.limit) : undefined,
  from: flags.from ? Number(flags.from) : 0,
  // ASCII-friendly flags (avoid passing Hebrew on the Windows CLI):
  //   --pending-only  => only guests with status "ממתין"
  //   --unsent-only   => skip guests already marked as invitation-sent (no double sends)
  //   --mark-sent     => mark each successful recipient as "invitation sent"
  status: typeof flags.status === 'string' ? flags.status : flags['pending-only'] ? 'ממתין' : undefined,
  unsentOnly: Boolean(flags['unsent-only']),
  mark: Boolean(flags.mark || flags['mark-sent']),
  extra: typeof flags.extra === 'string' ? flags.extra.split(',').map((s) => s.trim()).filter(Boolean) : [],
  numbers: typeof flags.numbers === 'string' ? flags.numbers.split(',').map((s) => s.trim()).filter(Boolean) : [],
  delay: flags.delay ? Number(flags.delay) : 350,
};

if (mode === 'test') {
  await runTest(opts);
} else if (mode === 'live') {
  await runLive(opts);
} else {
  console.error(`Unknown mode "${mode}". Use "test" or "live".`);
  process.exit(1);
}
