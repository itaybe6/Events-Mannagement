// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";

type SendCheckinTableSmsRequest = {
  eventId: string;
  guestId: string;
  /** "checkin" = arrival message; "table_update" = table number update after move */
  type?: "checkin" | "table_update";
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

function normalizePhone(raw: unknown): { ok: true; value: string } | { ok: false; value: string } {
  const s = String(raw ?? "").trim();
  const cleaned = s.replace(/[^\d+]/g, "");
  const digits = cleaned.replace(/\D/g, "");
  if (!digits || digits.length < 7) return { ok: false, value: cleaned };
  return { ok: true, value: cleaned };
}

function pulseemBodyLooksOk(text: string): { ok: boolean; reason?: string } {
  const s = (text ?? "").trim();
  if (!s) return { ok: false, reason: "empty_pulseem_response" };
  try {
    const j = JSON.parse(s);
    const status = String(j?.status ?? "").toLowerCase();
    const err = String(j?.error ?? j?.message ?? "").trim();
    if (status === "error") return { ok: false, reason: err || "pulseem_status_error" };
    if (!status && err) return { ok: false, reason: err };
    if (status && status !== "success" && status !== "ok" && err) return { ok: false, reason: err };
    return { ok: true };
  } catch {
    if (s.toLowerCase().includes("error")) return { ok: false, reason: "pulseem_error_in_body" };
    return { ok: true };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return json({ error: "Missing Supabase environment variables" }, { status: 500 });
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
      } else {
        const msg = String(res2.error?.message ?? authError?.message ?? "Unauthorized");
        return json({ error: `Unauthorized: ${msg}` }, { status: 401 });
      }
    }

    const body = (await req.json()) as Partial<SendCheckinTableSmsRequest>;
    const eventId = String(body.eventId ?? "").trim();
    const guestId = String(body.guestId ?? "").trim();
    const messageType = String(body.type ?? "checkin").trim() as "checkin" | "table_update";
    const smsType = messageType === "table_update" ? "table_update" : "checkin";

    if (!eventId || !guestId) {
      return json({ error: "Missing eventId or guestId" }, { status: 400 });
    }

    const userId = authData.user.id;

    const [{ data: profile, error: profileError }, { data: eventRow, error: eventError }] = await Promise.all([
      adminClient.from("users").select("id, user_type").eq("id", userId).maybeSingle(),
      adminClient.from("events").select("id, user_id").eq("id", eventId).maybeSingle(),
    ]);
    if (profileError) return json({ error: profileError.message }, { status: 500 });
    if (eventError) return json({ error: eventError.message }, { status: 500 });
    if (!eventRow) return json({ error: "Event not found" }, { status: 404 });
    if (!profile) return json({ error: "User profile not found" }, { status: 403 });

    const userType = String((profile as any).user_type ?? "");
    const ownerId = String((eventRow as any).user_id ?? "");
    const isAllowed =
      userType === "admin" ||
      userType === "employee" ||
      (userType === "event_owner" && ownerId === userId);
    if (!isAllowed) return json({ error: "Forbidden" }, { status: 403 });

    const { data: guest, error: guestError } = await adminClient
      .from("guests")
      .select("id, name, phone, table_id")
      .eq("id", guestId)
      .eq("event_id", eventId)
      .maybeSingle();

    if (guestError) return json({ error: guestError.message }, { status: 500 });
    if (!guest) return json({ error: "Guest not found" }, { status: 404 });

    const phoneNorm = normalizePhone((guest as any).phone);
    if (!phoneNorm.ok) {
      return json({ error: "Guest has no valid phone number", sent: false }, { status: 400 });
    }

    let tableNumber: number | null = null;
    const tableId = (guest as any).table_id ? String((guest as any).table_id).trim() : null;
    if (tableId) {
      const { data: tableRow } = await adminClient
        .from("tables")
        .select("number")
        .eq("id", tableId)
        .maybeSingle();
      if (tableRow != null) {
        const n = (tableRow as any).number;
        if (typeof n === "number" && Number.isFinite(n)) tableNumber = n;
        else if (typeof n === "string") {
          const parsed = parseInt(n.trim(), 10);
          if (Number.isFinite(parsed)) tableNumber = parsed;
        }
      }
    }

    const message =
      smsType === "table_update"
        ? tableNumber != null
          ? `עדכון: מספר השולחן שלך הוא ${tableNumber}`
          : "עדכון: לא שובצת לשולחן."
        : tableNumber != null
          ? `השולחן שלך הוא ${tableNumber}`
          : "הגעת לאירוע. ברוך הבא!";

    const sendId = `${smsType}-${eventId.replace(/-/g, "").slice(0, 8)}-${Date.now().toString(36)}`;

    const payload: any = {
      sendId,
      isAsync: false,
      smsSendData: {
        toNumberList: [phoneNorm.value],
        referenceList: [guestId],
        textList: [message],
      },
    };
    if (pulseemFromNumber) payload.smsSendData.fromNumber = pulseemFromNumber;

    const pulseemUrl = "https://api.pulseem.com/api/v1/SmsApi/SendSms";
    const resp = await fetch(pulseemUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "APIKey": pulseemApiKey,
        "X-Api-Key": pulseemApiKey,
      },
      body: JSON.stringify(payload),
    });

    const respText = await resp.text().catch(() => "");
    const parsed = pulseemBodyLooksOk(respText);
    const effectiveOk = resp.ok && parsed.ok;

    if (effectiveOk) {
      const rows = [
        {
          event_id: eventId,
          type: "SMS",
          recipient: String((guest as any).name ?? "אורח"),
          phone: phoneNorm.value,
          status: `נשלח (${smsType === "table_update" ? "עדכון שולחן" : "צ'ק-אין שולחן"}, sendId=${sendId})`,
          sent_date: new Date().toISOString(),
        },
      ];
      await adminClient.from("messages").insert(rows);
    }

    return json({
      ok: effectiveOk,
      sent: effectiveOk,
      error: effectiveOk ? undefined : (parsed.reason || respText || "Unknown error"),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message, sent: false }, { status: 500 });
  }
});
