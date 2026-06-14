const TOKEN = process.env.WA_TOKEN;
const WABA_ID = '2249140762156668';

const url = `https://graph.facebook.com/v23.0/${WABA_ID}/message_templates?limit=200`;
const resp = await fetch(url, {
  headers: { Authorization: `Bearer ${TOKEN}` },
});
const json = await resp.json();
if (!resp.ok) {
  console.error('ERROR', resp.status, JSON.stringify(json, null, 2));
  process.exit(1);
}
for (const t of json.data ?? []) {
  console.log('====================================');
  console.log('name:', t.name, '| language:', t.language, '| status:', t.status, '| category:', t.category);
  console.log(JSON.stringify(t.components, null, 2));
}
