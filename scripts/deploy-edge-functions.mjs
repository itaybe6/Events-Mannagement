#!/usr/bin/env node
/**
 * Deploy edge functions via Supabase Management API.
 * Requires SUPABASE_ACCESS_TOKEN with deploy permissions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'cxlmixykahuchilhyjjv';
const payloadDir = path.join(__dirname, '.deploy-payloads');

const token = String(process.env.SUPABASE_ACCESS_TOKEN ?? '').trim();
if (!token) {
  console.error('Missing SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}

const names = process.argv.slice(2);
const targets =
  names.length > 0
    ? names
    : ['send-invitation-sms', 'send-whatsapp-template', 'process-scheduled-notification-sms'];

for (const name of targets) {
  const payloadPath = path.join(payloadDir, `${name}.json`);
  if (!fs.existsSync(payloadPath)) {
    console.error(`Missing payload: ${payloadPath}`);
    process.exit(1);
  }
  const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/deploy?slug=${encodeURIComponent(name)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      metadata: {
        entrypoint_path: payload.entrypoint_path,
        verify_jwt: payload.verify_jwt,
      },
      files: payload.files,
    }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    console.error(`FAILED ${name} (${resp.status}):`, text.slice(0, 500));
    process.exit(1);
  }
  console.log(`OK ${name}:`, text.slice(0, 200));
}
