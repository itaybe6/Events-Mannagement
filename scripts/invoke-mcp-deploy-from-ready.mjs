#!/usr/bin/env node
/** Read _ready-for-mcp.json and print deploy args JSON to stdout (UTF-8). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const input =
  process.argv[2] ||
  path.join(__dirname, '.deploy-payloads', '_ready-for-mcp.json');
const j = JSON.parse(fs.readFileSync(input, 'utf8'));
const args = {
  name: j.name,
  entrypoint_path: j.entrypoint_path,
  verify_jwt: j.verify_jwt,
  files: j.files,
};
process.stdout.write(JSON.stringify(args));
