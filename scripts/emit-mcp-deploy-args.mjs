#!/usr/bin/env node
/**
 * Reads deploy args JSON and prints MCP deploy_edge_function arguments to stdout.
 * Usage: node scripts/emit-mcp-deploy-args.mjs scripts/.deploy-payloads/process-scheduled-notification-sms.json
 */
import fs from 'node:fs';

const input = process.argv[2];
if (!input) {
  console.error('Usage: emit-mcp-deploy-args.mjs <payload.json>');
  process.exit(1);
}
const payload = JSON.parse(fs.readFileSync(input, 'utf8'));
const args = {
  name: payload.name,
  entrypoint_path: payload.entrypoint_path,
  verify_jwt: payload.verify_jwt,
  files: payload.files,
};
if (!args.name || !Array.isArray(args.files) || args.files.length < 2) {
  console.error('Invalid payload shape');
  process.exit(1);
}
if (!args.files[0].content.includes('serve(async')) {
  console.error('index.ts missing expected scheduler code');
  process.exit(1);
}
process.stdout.write(JSON.stringify(args));
