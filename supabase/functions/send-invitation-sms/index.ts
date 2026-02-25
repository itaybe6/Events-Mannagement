// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";

type GuestStatus = "מגיע" | "לא מגיע" | "ממתין";

type SendInvitationSmsRequest = {
  eventId: string;
  guestIds?: string[];
  filterStatus?: "all" | GuestStatus;
  messageTemplate: string;
  baseUrl?: string;
};

type SendInvitationSmsResult = {
  totalSelected: number;
  totalValidPhone: number;
  skippedNoPhone: number;
  skippedInvalidPhone: number;
  sent: number;
  failed: number;
  failures: Array<{ guestId: string; phone?: string | null; reason: string }>;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

function getBaseUrl(req: Request, fromBody?: string) {
  const raw = String(fromBody ?? "").trim();
  if (raw) return raw.replace(/\/+$/, "");

  const fromEnv = String(Deno.env.get("SITE_BASE_URL") ?? "").trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  if (host) return `${proto}://${host}`.replace(/\/+$/, "");

  return "";
}

function fillTemplate(template: string, vars: Record<string, string>) {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(v);
  }
  return out;
}

function normalizePhone(raw: unknown): { ok: true; value: string } | { ok: false; value: string } {
  const s = String(raw ?? "").trim();
  const cleaned = s.replace(/[^\d+]/g, "");
  // Keep it permissive; just ensure it's not empty and has enough digits.
  const digits = cleaned.replace(/\D/g, "");
  if (!digits || digits.length < 7) return { ok: false, value: cleaned };
  return { ok: true, value: cleaned };
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return json({ error: "Missing Supabase environment variables for Edge Function" }, { status: 500 });
    }

    const pulseemApiKey = Deno.env.get("PULSEEM_API_KEY");
    const pulseemFromNumber = String(Deno.env.get("PULSEEM_FROM_NUMBER") ?? "").trim();
    if (!pulseemApiKey) {
      return json({ error: "Missing Pulseem secret (PULSEEM_API_KEY)" }, { status: 500 });
    }

    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Unauthorized: missing bearer token" }, { status: 401 });
    }

    const bearerToken = authHeader.slice(7).trim();
    if (!bearerToken) {
      return json({ error: "Unauthorized: empty bearer token" }, { status: 401 });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // Validate the user token. Try with anon client first; fall back to service-role validation
    // in case the environment has unusual GoTrue settings.
    let authData: { user: { id: string } } | null = null;
    let authError: any = null;

    {
      const res = await userClient.auth.getUser();
      authError = res.error;
      authData = res.data?.user ? ({ user: { id: res.data.user.id } } as any) : null;
    }

    if (!authData?.user?.id) {
      const res2 = await adminClient.auth.getUser(bearerToken);
      if (!res2.error && res2.data?.user) {
        authData = { user: { id: res2.data.user.id } };
        authError = null;
      } else {
        const msg = String(res2.error?.message ?? authError?.message ?? "Unauthorized");
        const code = String(res2.error?.code ?? authError?.code ?? "");
        return json({ error: `Unauthorized: ${msg}${code ? ` (${code})` : ""}` }, { status: 401 });
      }
    }

    const body = (await req.json()) as Partial<SendInvitationSmsRequest>;
    const eventId = String(body.eventId ?? "").trim();
    const messageTemplate = String(body.messageTemplate ?? "").trim();
    const filterStatusRaw = body.filterStatus ?? "all";
    const filterStatus = String(filterStatusRaw).trim() as "all" | GuestStatus;
    const guestIds = Array.isArray(body.guestIds) ? body.guestIds.map(String).map((s) => s.trim()).filter(Boolean) : [];

    if (!eventId) return json({ error: "Missing eventId" }, { status: 400 });
    if (!messageTemplate) return json({ error: "Missing messageTemplate" }, { status: 400 });
    if (messageTemplate.length > 800) return json({ error: "messageTemplate too long" }, { status: 400 });
    if (filterStatus !== "all" && filterStatus !== "מגיע" && filterStatus !== "ממתין" && filterStatus !== "לא מגיע") {
      return json({ error: "Invalid filterStatus" }, { status: 400 });
    }

    const userId = authData.user.id;

    const [{ data: profile, error: profileError }, { data: eventRow, error: eventError }] = await Promise.all([
      adminClient.from("users").select("id, user_type").eq("id", userId).maybeSingle(),
      adminClient.from("events").select("id, user_id, title").eq("id", eventId).maybeSingle(),
    ]);
    if (profileError) return json({ error: profileError.message }, { status: 500 });
    if (eventError) return json({ error: eventError.message }, { status: 500 });
    if (!eventRow) return json({ error: "Event not found" }, { status: 404 });
    if (!profile) return json({ error: "User profile not found" }, { status: 403 });

    const userType = String((profile as any).user_type ?? "");
    const ownerId = String((eventRow as any).user_id ?? "");
    const isAllowed = userType === "admin" || (userType === "event_owner" && ownerId === userId);
    if (!isAllowed) return json({ error: "Forbidden" }, { status: 403 });

    let q = adminClient
      .from("guests")
      .select("id, name, phone, status, invitation_code, invitation_token")
      .eq("event_id", eventId);

    if (guestIds.length > 0) {
      q = q.in("id", guestIds);
    } else if (filterStatus !== "all") {
      q = q.eq("status", filterStatus);
    }

    const { data: guests, error: guestsError } = await q;
    if (guestsError) return json({ error: guestsError.message }, { status: 500 });

    const baseUrl = getBaseUrl(req, body.baseUrl);
    if (!baseUrl) return json({ error: "Missing baseUrl (pass from client or set SITE_BASE_URL secret)" }, { status: 400 });

    const eventTitle = String((eventRow as any)?.title ?? "").trim();

    const failures: SendInvitationSmsResult["failures"] = [];
    const prepared = (guests ?? []).map((g: any) => {
      const token = String(g.invitation_code ?? g.invitation_token ?? "").trim();
      const link = token ? `${baseUrl}/i/${token}` : "";
      const rawPhone = g.phone;
      const n = normalizePhone(rawPhone);
      const phoneOk = n.ok ? n.value : "";
      const hasPhone = Boolean(String(rawPhone ?? "").trim());
      const hasToken = Boolean(token);
      const text = fillTemplate(messageTemplate, {
        name: String(g.name ?? "").trim(),
        link,
        event: eventTitle,
      });
      return {
        id: String(g.id),
        name: String(g.name ?? "").trim(),
        phoneRaw: rawPhone,
        hasPhone,
        phoneOk,
        phoneValid: n.ok,
        hasToken,
        link,
        text,
      };
    });

    const totalSelected = prepared.length;
    const noPhone = prepared.filter((p) => !p.hasPhone).length;
    const invalidPhone = prepared.filter((p) => p.hasPhone && !p.phoneValid).length;

    const sendable = prepared.filter((p) => {
      if (!p.hasPhone) {
        failures.push({ guestId: p.id, phone: p.phoneRaw ?? null, reason: "missing_phone" });
        return false;
      }
      if (!p.phoneValid) {
        failures.push({ guestId: p.id, phone: p.phoneRaw ?? null, reason: "invalid_phone" });
        return false;
      }
      if (!p.hasToken) {
        failures.push({ guestId: p.id, phone: p.phoneRaw ?? null, reason: "missing_invitation_token" });
        return false;
      }
      return true;
    });

    const pulseemUrl = "https://api.pulseem.com/api/v1/SmsApi/SendSms";
    const sendIdBase = `${eventId}-${Date.now()}`;

    let sent = 0;
    let failed = 0;

    // Pulseem supports bulk lists; chunk to be safe.
    const batches = chunk(sendable, 200);
    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi];
      const sendId = `${sendIdBase}-${bi + 1}`;

      const payload: any = {
        sendId,
        isAsync: false,
        smsSendData: {
          toNumberList: batch.map((b) => b.phoneOk),
          referenceList: batch.map((b) => b.id),
          textList: batch.map((b) => b.text),
        },
      };
      // `fromNumber` can be omitted if your Pulseem account has a default sender.
      if (pulseemFromNumber) {
        payload.smsSendData.fromNumber = pulseemFromNumber;
      }

      const resp = await fetch(pulseemUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Pulseem Swagger defines header name as `APIKey` (and some docs mention `X-Api-Key`).
          // Send both to be safe across accounts/environments.
          "APIKey": pulseemApiKey,
          "X-Api-Key": pulseemApiKey,
        },
        body: JSON.stringify(payload),
      });

      const ok = resp.ok;
      if (!ok) {
        const errText = await resp.text().catch(() => "");
        for (const b of batch) {
          failures.push({ guestId: b.id, phone: b.phoneOk, reason: `pulseem_error_${resp.status}${errText ? `:${errText}` : ""}` });
        }
        failed += batch.length;
      } else {
        sent += batch.length;
      }

      // Log to messages table (best-effort)
      const status = ok ? "נשלח" : "נכשל";
      const rows = batch.map((b) => ({
        event_id: eventId,
        type: "SMS",
        recipient: b.name || "מוזמן",
        phone: b.phoneOk,
        status,
        sent_date: new Date().toISOString(),
      }));
      const { error: logError } = await adminClient.from("messages").insert(rows);
      if (logError) {
        // Don't fail the whole request because of logging
        console.warn("Failed to insert messages log:", logError);
      }
    }

    const result: SendInvitationSmsResult = {
      totalSelected,
      totalValidPhone: sendable.length,
      skippedNoPhone: noPhone,
      skippedInvalidPhone: invalidPhone,
      sent,
      failed,
      failures,
    };

    return json({ ok: true, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, { status: 500 });
  }
});

