#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
if (!name) {
  console.error('Usage: mcp-deploy-args.mjs <function-name>');
  process.exit(1);
}
const p = path.join(__dirname, '.deploy-payloads', `_mcp-${name}.json`);
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
process.stdout.write(JSON.stringify({
  name: j.name,
  entrypoint_path: j.entrypoint_path,
  verify_jwt: j.verify_jwt,
  files: j.files,
}));
