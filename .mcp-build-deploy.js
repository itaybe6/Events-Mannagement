const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PROJECT_ID = 'cxlmixykahuchilhyjjv';
const SHARED = path.join(ROOT, 'expo/supabase/functions/_shared/whatsapp.ts');

const FUNCTIONS = {
  'send-whatsapp-template': path.join(ROOT, 'expo/supabase/functions/send-whatsapp-template/index.ts'),
  'process-scheduled-notification-sms': path.join(ROOT, 'expo/supabase/functions/process-scheduled-notification-sms/index.ts'),
};

function buildDeployArgs(name) {
  const indexPath = FUNCTIONS[name];
  if (!indexPath) throw new Error(`Unknown function: ${name}`);
  return {
    project_id: PROJECT_ID,
    name,
    entrypoint_path: 'index.ts',
    verify_jwt: false,
    files: [
      { name: 'index.ts', content: fs.readFileSync(indexPath, 'utf8') },
      { name: '../_shared/whatsapp.ts', content: fs.readFileSync(SHARED, 'utf8') },
    ],
  };
}

const name = process.argv[2];
const out = process.argv[3];
if (!name) {
  console.error('Usage: node .mcp-build-deploy.js <function-name> [out.json]');
  process.exit(1);
}

const args = buildDeployArgs(name);
const json = JSON.stringify(args);
if (out) {
  fs.writeFileSync(out, json, 'utf8');
  console.log(JSON.stringify({ ok: true, name, out, bytes: json.length, indexBytes: args.files[0].content.length, sharedBytes: args.files[1].content.length }));
} else {
  process.stdout.write(json);
}
