#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

for (const envFile of ['.env.local', '.env', path.join('expo', '.env')]) {
  loadEnvFile(path.join(root, envFile));
}

const token = String(process.env.SUPABASE_ACCESS_TOKEN ?? '').trim();
if (!token) {
  console.error('Missing SUPABASE_ACCESS_TOKEN in env');
  process.exit(1);
}

const payloadPath =
  process.argv[2] ??
  path.join(__dirname, '.deploy-payloads', 'process-scheduled-notification-sms.json');
const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
const projectRef = 'cxlmixykahuchilhyjjv';
const name = payload.name;
const url = `https://api.supabase.com/v1/projects/${projectRef}/functions/deploy?slug=${encodeURIComponent(name)}`;

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
console.log(`OK ${name}:`, text.slice(0, 300));
