// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";

const DEFAULT_MUZ_REGISTER_URL =
  "https://test-server-g-bb72244cb530.herokuapp.com/auth/registerCoupleMuz/";

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

function normalizePhone(raw: unknown): { ok: true; value: string } | { ok: false; value: string } {
  const s = String(raw ?? "").trim();
  const cleaned = s.replace(/[^\d+]/g, "");
  const digits = cleaned.replace(/\D/g, "");
  if (!digits || digits.length < 7) return { ok: false, value: cleaned };
  return { ok: true, value: digits };
}

function buildUniqueDescription(event: {
  title?: string | null;
  groom_name?: string | null;
  bride_name?: string | null;
}) {
  const groom = String(event.groom_name ?? "").trim();
  const bride = String(event.bride_name ?? "").trim();
  if (groom && bride) return `החתונה של ${bride} ו${groom}`;

  const rawTitle = String(event.title ?? "").trim();
  if (!rawTitle) return "אירוע";
  const parts = rawTitle.split(/(?:\s*[–—-]\s*)/g).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) return parts.slice(1).join(" - ") || rawTitle;
  return rawTitle;
}

type RegisterCreditTerminalRequest = {
  eventId: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  try {
    const supabaseUrl = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
    const supabaseAnonKey = String(Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
    const supabaseServiceKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return json({ error: "Missing Supabase environment variables for Edge Function" }, { status: 500 });
    }

    const muzBearer = String(Deno.env.get("MUZ_REGISTER_BEARER_TOKEN") ?? "").trim();
    const muzUrl = String(Deno.env.get("MUZ_REGISTER_API_URL") ?? DEFAULT_MUZ_REGISTER_URL).trim();
    if (!muzBearer) {
      return json({ error: "Missing MUZ_REGISTER_BEARER_TOKEN secret" }, { status: 500 });
    }

    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Unauthorized: missing bearer token" }, { status: 401 });
    }
    const bearerToken = authHeader.slice(7).trim();
    if (!bearerToken) return json({ error: "Unauthorized: empty bearer token" }, { status: 401 });

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    let userId = "";
    {
      const res = await userClient.auth.getUser();
      userId = String(res.data?.user?.id ?? "").trim();
      if (!userId) {
        const res2 = await adminClient.auth.getUser(bearerToken);
        userId = String(res2.data?.user?.id ?? "").trim();
        if (!userId) {
          const msg = String(res2.error?.message ?? res.error?.message ?? "Unauthorized");
          const code = String(res2.error?.code ?? res.error?.code ?? "");
          return json({ error: `Unauthorized: ${msg}${code ? ` (${code})` : ""}` }, { status: 401 });
        }
      }
    }

    const { data: profile, error: profileError } = await adminClient
      .from("users")
      .select("id, user_type")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) return json({ error: profileError.message }, { status: 500 });
    const userType = String(profile?.user_type ?? "");
    if (userType !== "admin") return json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Partial<RegisterCreditTerminalRequest>;
    const eventId = String(body.eventId ?? "").trim();
    if (!eventId) return json({ error: "Missing eventId" }, { status: 400 });

    const { data: eventRow, error: eventError } = await adminClient
      .from("events")
      .select("id, title, date, groom_name, bride_name, user_id")
      .eq("id", eventId)
      .maybeSingle();
    if (eventError) return json({ error: eventError.message }, { status: 500 });
    if (!eventRow) return json({ error: "Event not found" }, { status: 404 });

    const ownerId = String(eventRow.user_id ?? "").trim();
    if (!ownerId) return json({ error: "Event has no owner" }, { status: 400 });

    const { data: ownerRow, error: ownerError } = await adminClient
      .from("users")
      .select("phone")
      .eq("id", ownerId)
      .maybeSingle();
    if (ownerError) return json({ error: ownerError.message }, { status: 500 });

    const phoneNorm = normalizePhone(ownerRow?.phone);
    if (!phoneNorm.ok) {
      return json(
        { error: "לזוג האירוע חסר מספר טלפון תקין בפרופיל. עדכנו את הטלפון ונסו שוב." },
        { status: 400 },
      );
    }

    const eventDateRaw = eventRow.date ? new Date(eventRow.date) : null;
    if (!eventDateRaw || !Number.isFinite(eventDateRaw.getTime())) {
      return json({ error: "תאריך האירוע חסר או לא תקין" }, { status: 400 });
    }

    const payload = {
      phone: phoneNorm.value,
      uniqueDescription: buildUniqueDescription(eventRow),
      eventDate: eventDateRaw.toISOString(),
      producer: "Moon events",
    };

    const upstream = await fetch(muzUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${muzBearer}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const upstreamText = await upstream.text().catch(() => "");
    let upstreamJson: unknown = null;
    try {
      upstreamJson = upstreamText ? JSON.parse(upstreamText) : null;
    } catch {
      upstreamJson = upstreamText || null;
    }

    if (!upstream.ok) {
      return json(
        {
          ok: false,
          error: "שגיאה בשליחת הבקשה לספק המסוף",
          upstreamStatus: upstream.status,
          upstreamBody: upstreamJson,
          sent: payload,
        },
        { status: 502 },
      );
    }

    return json({
      ok: true,
      sent: payload,
      upstreamStatus: upstream.status,
      upstreamBody: upstreamJson,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, { status: 500 });
  }
});
