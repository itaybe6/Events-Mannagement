import fs from 'fs';
const args = JSON.parse(fs.readFileSync('.mcp-deploy-proc-live.json', 'utf8'));
const c0 = args.files[0].content;
console.log(JSON.stringify({
  pre: {
    waRemainingQuota: c0.includes('waRemainingQuota'),
    claim_due: c0.includes('claim_due_sms_notification_settings'),
    file1: args.files[1].name,
    verify_jwt: args.verify_jwt,
    indexByteLen: Buffer.byteLength(c0, 'utf8'),
  },
  deployArgs: args,
}));
