#!/usr/bin/env node
/** Print deploy_edge_function args JSON for MCP (stdout). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const input = process.argv[2];
if (!input) {
  console.error('Usage: mcp-deploy-from-file.mjs <deploy-json-path>');
  process.exit(1);
}
const j = JSON.parse(fs.readFileSync(input, 'utf8'));
process.stdout.write(
  JSON.stringify({
    name: j.name,
    entrypoint_path: j.entrypoint_path,
    verify_jwt: j.verify_jwt,
    files: j.files,
  }),
);
