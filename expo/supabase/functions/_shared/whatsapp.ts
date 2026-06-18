// @ts-nocheck
// Shared WhatsApp Cloud API helpers used by the send + scheduler Edge Functions.

export type WaTemplateButton = {
  index: number;
  label?: string;
  kind: "invitation" | "fixed";
  base_url?: string;
  suffix?: string;
};

export type WaTemplate = {
  id?: string;
  template_name: string;
  language_code: string;
  header_type?: "none" | "image" | "text";
  body_text?: string;
  variables?: Array<{ index: number; label?: string; sample?: string }>;
  buttons?: WaTemplateButton[];
};

export type WaParams = {
  header_image_url?: string | null;
  header_text?: string | null;
  // Values aligned to the template variable order. Each may contain {name}/{link}/etc.
  body?: string[];
  // Per-button overrides (mostly for "fixed" suffixes).
  buttons?: Array<{ index: number; kind?: string; suffix?: string }>;
};

export const WA_GRAPH_VERSION = "v21.0";

// ---------------------------------------------------------------------------
// Dynamic access token: encrypted at rest (AES-256-GCM).
// The key lives only in the Edge env and is never exposed to clients.
// ---------------------------------------------------------------------------
function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function getTokenEncSecret(): string {
  return String(
    Deno.env.get("WHATSAPP_TOKEN_ENC_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      "",
  ).trim();
}

async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptToken(
  plaintext: string,
  secret: string,
): Promise<{ ciphertext: string; iv: string }> {
  const key = await deriveAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ctBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  return { ciphertext: bytesToBase64(new Uint8Array(ctBuf)), iv: bytesToBase64(iv) };
}

export async function decryptToken(
  ciphertextB64: string,
  ivB64: string,
  secret: string,
): Promise<string> {
  const key = await deriveAesKey(secret);
  const ct = base64ToBytes(ciphertextB64);
  const iv = base64ToBytes(ivB64);
  const ptBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(ptBuf);
}

// Resolve the active WhatsApp token: prefer the encrypted DB token (uploaded by
// the manager), fall back to the WHATSAPP_ACCESS_TOKEN env secret.
export async function resolveWhatsappToken(adminClient: any, envToken: unknown): Promise<string> {
  try {
    const { data } = await adminClient
      .from("whatsapp_settings")
      .select("access_token_ciphertext, access_token_iv")
      .eq("id", true)
      .maybeSingle();
    const ct = (data as any)?.access_token_ciphertext;
    const iv = (data as any)?.access_token_iv;
    if (ct && iv) {
      const secret = getTokenEncSecret();
      if (secret) {
        const t = await decryptToken(String(ct), String(iv), secret);
        if (t && t.trim()) return t.trim();
      }
    }
  } catch (e) {
    console.warn("resolveWhatsappToken failed:", e);
  }
  return String(envToken ?? "").trim();
}

export function stripMarks(s: unknown): string {
  return String(s ?? "").replace(/[\u200E\u200F\u202A-\u202E]/g, "").trim();
}

// Fill {key} / {{key}} placeholders with the provided variables.
export function fillTemplate(template: string, vars: Record<string, string>): string {
  let out = String(template ?? "");
  for (const [kRaw, vRaw] of Object.entries(vars)) {
    const k = stripMarks(kRaw);
    const v = String(vRaw ?? "");
    out = out.split(`{${k}}`).join(v);
    out = out.split(`{{${k}}}`).join(v);
    out = out.split(`(${k})`).join(v);
  }
  out = out.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (full, inner) => {
    const key = stripMarks(inner);
    return Object.prototype.hasOwnProperty.call(vars, key) ? String((vars as any)[key] ?? "") : full;
  });
  out = out.replace(/\{(?!\{)\s*([^{}]+?)\s*\}(?!\})/g, (full, inner) => {
    const key = stripMarks(inner);
    return Object.prototype.hasOwnProperty.call(vars, key) ? String((vars as any)[key] ?? "") : full;
  });
  return out;
}

// WhatsApp wants international digits (no '+'). Israeli numbers -> 972XXXXXXXXX.
export function normalizeWaPhone(raw: unknown): { ok: boolean; value: string } {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return { ok: false, value: "" };
  if (digits.startsWith("972")) return { ok: digits.length >= 11, value: digits };
  if (digits.startsWith("0")) {
    const v = "972" + digits.slice(1);
    return { ok: v.length >= 11, value: v };
  }
  if (digits.length === 9 && "23456789".includes(digits[0])) {
    return { ok: true, value: "972" + digits };
  }
  return { ok: digits.length >= 8, value: digits };
}

// Build the Meta Cloud API "template" message payload for a single recipient.
export function buildWaPayload(args: {
  to: string;
  template: WaTemplate;
  params?: WaParams | null;
  vars: Record<string, string>;
  invitationCode?: string;
}): Record<string, unknown> {
  const { to, template, params, vars } = args;
  const invitationCode = String(args.invitationCode ?? "").trim();
  const components: any[] = [];

  const headerType = String(template.header_type ?? "none");
  if (headerType === "image") {
    const link = String(params?.header_image_url ?? "").trim();
    if (link) {
      components.push({ type: "header", parameters: [{ type: "image", image: { link } }] });
    }
  } else if (headerType === "text") {
    const txt = fillTemplate(String(params?.header_text ?? ""), vars).trim();
    if (txt) {
      components.push({ type: "header", parameters: [{ type: "text", text: txt }] });
    }
  }

  const variables = Array.isArray(template.variables) ? template.variables : [];
  if (variables.length > 0) {
    const bodyValues = Array.isArray(params?.body) ? params!.body : [];
    const ordered = [...variables].sort((a, b) => Number(a.index) - Number(b.index));
    const parameters = ordered.map((v, i) => {
      const raw = bodyValues[i] ?? v.sample ?? "";
      const text = fillTemplate(String(raw), vars);
      return { type: "text", text: text || " " };
    });
    components.push({ type: "body", parameters });
  }

  const buttons = Array.isArray(template.buttons) ? template.buttons : [];
  const paramButtons = Array.isArray(params?.buttons) ? params!.buttons : [];
  for (const btn of buttons) {
    const override = paramButtons.find((b) => Number(b.index) === Number(btn.index));
    let suffix = "";
    if (btn.kind === "invitation") {
      suffix = invitationCode;
    } else {
      suffix = String(override?.suffix ?? btn.suffix ?? "").trim();
    }
    // Only URL buttons with a dynamic {{1}} suffix need a component.
    if (!suffix) continue;
    components.push({
      type: "button",
      sub_type: "url",
      index: String(btn.index),
      parameters: [{ type: "text", text: suffix }],
    });
  }

  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: template.template_name,
      language: { code: template.language_code || "he" },
      ...(components.length > 0 ? { components } : {}),
    },
  };
  return payload;
}

export async function sendWaMessage(args: {
  phoneNumberId: string;
  accessToken: string;
  payload: Record<string, unknown>;
}): Promise<{ ok: boolean; status: number; messageId?: string; error?: string; body?: string }> {
  const { phoneNumberId, accessToken, payload } = args;
  const url = `https://graph.facebook.com/${WA_GRAPH_VERSION}/${phoneNumberId}/messages`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await resp.text().catch(() => "");
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    if (!resp.ok) {
      const err = parsed?.error?.message || `http_${resp.status}`;
      return { ok: false, status: resp.status, error: String(err), body: text.slice(0, 500) };
    }
    const messageId = parsed?.messages?.[0]?.id ? String(parsed.messages[0].id) : undefined;
    return { ok: true, status: resp.status, messageId, body: text.slice(0, 300) };
  } catch (e) {
    const msg = e instanceof Error ? (e.name === "AbortError" ? "timeout_30s" : e.message) : String(e);
    return { ok: false, status: 0, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

const EVENT_TYPE_PREFIXES = ["חתונה", "בר מצווה", "בת מצווה", "ברית", "בריתה", "אירוע חברה"];

export function getEventDisplayTitle(rawTitle: unknown): string {
  const raw = String(rawTitle ?? "").trim();
  if (!raw) return "";
  for (const eventType of EVENT_TYPE_PREFIXES) {
    const withoutPrefix = raw.replace(new RegExp(`^${eventType}\\s*[–—-]\\s*`), "").trim();
    if (withoutPrefix !== raw) return withoutPrefix || raw;
  }
  return raw;
}

// Build the per-guest substitution vars shared across SMS/WhatsApp.
export function buildGuestVars(args: {
  guest: any;
  baseUrl: string;
  eventTitle: string;
  eventDateText: string;
  eventLocationText: string;
  groomName: string;
  brideName: string;
  coupleNames: string;
}): Record<string, string> {
  const { guest, baseUrl, eventTitle, eventDateText, eventLocationText, groomName, brideName, coupleNames } = args;
  const token = String(guest.invitation_code ?? guest.invitation_token ?? "").trim();
  const link = token && baseUrl ? `${baseUrl}/i/${token}` : "";
  const fullName = String(guest.name ?? "").trim();
  const firstName = fullName ? fullName.split(/\s+/)[0] : "";
  return {
    name: fullName,
    link,
    event: eventTitle,
    event_date: eventDateText,
    date: eventDateText,
    "שם_פרטי": firstName || fullName,
    "שם_אירוע": eventTitle,
    "תאריך": eventDateText,
    "מיקום": eventLocationText,
    "שם_חתן": groomName,
    "שם_כלה": brideName,
    "שמות_חתן_כלה": coupleNames,
  };
}
