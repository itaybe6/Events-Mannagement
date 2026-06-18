// @ts-nocheck
// Edge Function: pulseem-admin-credentials
// ---------------------------------------------------------------------------
// Lets a manager check how many Direct SMS credits the app has left in Pulseem.
//
// There is a SINGLE Pulseem account for the whole application. The API key lives
// only in the Edge Function environment (PULSEEM_API_KEY, or PULSEEM_MAIN_API_KEY
// as a fallback) and is never exposed to clients. The function queries Pulseem's
// GetCreditBalance endpoint and extracts the Direct SMS balance, trying several
// body/response shapes Pulseem is known to use.
//
// Security:
//   - Gateway JWT verification is disabled (config.toml: verify_jwt = false);
//     authorization is enforced manually here.
//   - The caller must be a logged-in admin: we validate their Supabase JWT and
//     require users.user_type === "admin". This avoids ever shipping the
//     service-role key to the browser. A request with the service-role key as
//     the bearer token is also accepted (for server-to-server calls).
//   - Unauthorized requests get { error: "unauthorized" } with status 401.
//   - Secrets / full API keys are never logged or returned.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      ...(init?.headers ?? {}),
    },
  });
}

const PULSEEM_CREDIT_BALANCE_URL =
  "https://api.pulseem.com/api/v1/AccountsApi/GetCreditBalance";
const PULSEEM_TIMEOUT_MS = 20000;

// Normalize a key: lowercase + strip everything that isn't a letter/digit, so
// "directSmsCredits", "DirectSMSCredits", "direct_sms_credits" all collapse to
// the same token. Tolerates Pulseem's camelCase / PascalCase inconsistency.
function normKey(k: string): string {
  return String(k).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isUsableValue(value: unknown): boolean {
  return value !== undefined && value !== null && typeof value !== "object" && String(value).trim() !== "";
}

// Normalize a number-ish value to a clean string ("3990.0" -> "3990").
function formatCredits(value: unknown): string {
  const n = Number(value);
  if (Number.isFinite(n)) return String(n);
  return String(value);
}

// Recursively search the whole response tree for an SMS balance, regardless of
// how Pulseem wraps it. Prefers the Direct SMS balance when present, otherwise
// falls back to the regular SMS balance (the single app-wide account uses
// `smsCredits`; `directSmsCredits` is null unless the Direct feature is on).
function extractSmsCredits(parsed: any): string | null {
  // Each tier: flat keys to look for + the nested "<group>.credits" group name.
  const tiers: Array<{ flat: Set<string>; nested: string | null }> = [
    { flat: new Set(["directsmscredits", "directsmsbalance"]), nested: "directsms" },
    { flat: new Set(["smscredits", "smsbalance"]), nested: "sms" },
  ];

  const walkTier = (node: any, tier: { flat: Set<string>; nested: string | null }): string | null => {
    if (node == null || typeof node !== "object") return null;

    for (const [k, v] of Object.entries(node)) {
      const nk = normKey(k);
      if (tier.flat.has(nk) && isUsableValue(v)) return formatCredits(v);
      if (tier.nested && nk === tier.nested && v && typeof v === "object") {
        for (const [k2, v2] of Object.entries(v as any)) {
          if (normKey(k2) === "credits" && isUsableValue(v2)) return formatCredits(v2);
        }
      }
    }
    for (const v of Object.values(node)) {
      if (v && typeof v === "object") {
        const found = walkTier(v, tier);
        if (found !== null) return found;
      }
    }
    return null;
  };

  for (const tier of tiers) {
    const found = walkTier(parsed, tier);
    if (found !== null) return found;
  }
  return null;
}

type PulseemAttempt = {
  httpStatus: number;
  ok: boolean;
  networkError: string | null;
  bodySnippet: string;
};

async function callPulseemGetCreditBalance(
  apiKey: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; httpStatus: number; parsed: any; text: string; networkError?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PULSEEM_TIMEOUT_MS);
  try {
    const resp = await fetch(PULSEEM_CREDIT_BALANCE_URL, {
      method: "POST",
      headers: {
        // HTTP header names are case-insensitive; send a couple of spellings to
        // be safe across Pulseem environments.
        APIKEY: apiKey,
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await resp.text().catch(() => "");
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    return { ok: resp.ok, httpStatus: resp.status, parsed, text };
  } catch (e) {
    const msg = e instanceof Error ? (e.name === "AbortError" ? `timeout_${PULSEEM_TIMEOUT_MS}ms` : e.message) : String(e);
    return { ok: false, httpStatus: 0, parsed: null, text: "", networkError: msg };
  } finally {
    clearTimeout(timer);
  }
}

// Try multiple request-body variations, returning the first Direct SMS balance
// we can extract. Also collects (key-free) debug info for each attempt.
async function resolveDirectSmsCredits(
  apiKey: string,
  bodyVariations: Array<Record<string, unknown>>,
  label: string,
  attempts: PulseemAttempt[]
): Promise<string | null> {
  for (let i = 0; i < bodyVariations.length; i++) {
    const res = await callPulseemGetCreditBalance(apiKey, bodyVariations[i]);
    // Don't log keys/bodies; only coarse status info.
    console.log(`pulseem.getCreditBalance[${label}] variation ${i + 1}/${bodyVariations.length}`, {
      ok: res.ok,
      httpStatus: res.httpStatus,
      networkError: res.networkError ?? null,
    });
    attempts.push({
      httpStatus: res.httpStatus,
      ok: res.ok,
      networkError: res.networkError ?? null,
      bodySnippet: String(res.text ?? "").slice(0, 400),
    });
    if (res.ok && res.parsed) {
      const credits = extractSmsCredits(res.parsed);
      if (credits !== null) return credits;
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    // Single app-wide Pulseem account. PULSEEM_API_KEY is the primary secret;
    // PULSEEM_MAIN_API_KEY is supported as an alternative name.
    const pulseemApiKey = String(
      Deno.env.get("PULSEEM_API_KEY") ?? Deno.env.get("PULSEEM_MAIN_API_KEY") ?? ""
    ).trim();

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return json({ error: "Missing Supabase environment variables" }, { status: 500 });
    }

    // Manual authorization.
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
    const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!bearer) {
      return json({ error: "unauthorized" }, { status: 401 });
    }

    // Accept either the service-role key (server-to-server) OR a logged-in admin's JWT.
    let authorized = bearer === supabaseServiceKey;
    if (!authorized) {
      const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });

      let userId = "";
      const res = await userClient.auth.getUser();
      if (res.data?.user?.id) {
        userId = res.data.user.id;
      } else {
        const res2 = await adminClient.auth.getUser(bearer);
        if (res2.data?.user?.id) userId = res2.data.user.id;
      }

      if (userId) {
        const { data: profile } = await adminClient
          .from("users")
          .select("id, user_type")
          .eq("id", userId)
          .maybeSingle();
        authorized = String((profile as any)?.user_type ?? "") === "admin";
      }
    }

    if (!authorized) {
      return json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const action = String(body?.action ?? "").trim();

    if (action !== "fetch_direct_sms_balance") {
      return json({ ok: false, message: "פעולה לא נתמכת" }, { status: 400 });
    }

    if (!pulseemApiKey) {
      return json({ ok: false, message: "אין מפתח API של פולסים מוגדר במערכת" }, { status: 500 });
    }

    // Optional sub-account scoping (rarely needed for a single account).
    const subAccountName = String(body?.subAccountName ?? "").trim();

    const bodyVariations: Array<Record<string, unknown>> = subAccountName
      ? [
          { subAccountName, isSMSIncludeVoice: false },
          { SubAccountName: subAccountName, IsSMSIncludeVoice: false },
        ]
      : [
          {},
          { isSMSIncludeVoice: false },
          { IsSMSIncludeVoice: false },
        ];

    const attempts: PulseemAttempt[] = [];
    const credits = await resolveDirectSmsCredits(pulseemApiKey, bodyVariations, "main", attempts);

    if (credits !== null) {
      return json({ ok: true, directSmsCredits: credits });
    }

    return json({ ok: false, message: "לא ניתן לקרוא יתרת SMS API" });
  } catch (e) {
    console.error("pulseem-admin-credentials error", { message: e instanceof Error ? e.message : "unknown" });
    return json({ ok: false, message: "שגיאה לא צפויה בשרת" }, { status: 500 });
  }
});
