// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";
import {
  buildWaPayload,
  getWhatsappToken,
  normalizeWaPhone,
  parseTableNumber,
  sendWaMessage,
  type WaTemplate,
} from "../_shared/whatsapp.ts";

type SendCheckinTableSmsRequest = {
  eventId: string;
  guestId: string;
  /** "checkin" = arrival message; "table_update" = table number update after move */
  type?: "checkin" | "table_update";
};

const CHECKIN_TEMPLATE_NAME = "table_number";

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

function fallbackTableNumberTemplate(): WaTemplate {
  return {
    template_name: CHECKIN_TEMPLATE_NAME,
    language_code: "en",
    header_type: "none",
    variables: [{ index: 1, label: "מספר שולחן" }],
    buttons: [],
  };
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

    const waToken = getWhatsappToken();
    const waPhoneId = String(Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "").trim();
    if (!waToken) return json({ error: "missing_whatsapp_token" }, { status: 500 });
    if (!waPhoneId) {
      return json({ error: "Missing WhatsApp phone id (WHATSAPP_PHONE_NUMBER_ID)" }, { status: 500 });
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
    const sendKind = messageType === "table_update" ? "table_update" : "checkin";

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

    const phoneNorm = normalizeWaPhone((guest as any).phone);
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
      tableNumber = parseTableNumber((tableRow as any)?.number);
    }

    const tableNumberText = tableNumber != null ? String(tableNumber) : "ללא שולחן";

    const { data: tpl } = await adminClient
      .from("whatsapp_templates")
      .select("template_name, language_code, header_type, body_text, variables, buttons")
      .eq("template_name", CHECKIN_TEMPLATE_NAME)
      .eq("is_active", true)
      .maybeSingle();

    const template: WaTemplate = tpl
      ? {
          template_name: String((tpl as any).template_name || CHECKIN_TEMPLATE_NAME),
          language_code: String((tpl as any).language_code || "en"),
          header_type: ((tpl as any).header_type ?? "none") as WaTemplate["header_type"],
          body_text: (tpl as any).body_text,
          variables:
            Array.isArray((tpl as any).variables) && (tpl as any).variables.length > 0
              ? (tpl as any).variables
              : [{ index: 1, label: "מספר שולחן" }],
          buttons: Array.isArray((tpl as any).buttons) ? (tpl as any).buttons : [],
        }
      : fallbackTableNumberTemplate();

    const payload = buildWaPayload({
      to: phoneNorm.value,
      template,
      params: { body: [tableNumberText] },
      vars: {
        table: tableNumberText,
        "מספר_שולחן": tableNumberText,
      },
    });

    const res = await sendWaMessage({
      phoneNumberId: waPhoneId,
      accessToken: waToken,
      payload,
    });

    if (res.ok) {
      await adminClient.from("messages").insert([
        {
          event_id: eventId,
          type: "וואטסאפ",
          recipient: String((guest as any).name ?? "אורח"),
          phone: phoneNorm.value,
          status: `נשלח (${sendKind === "table_update" ? "עדכון שולחן" : "צ'ק-אין שולחן"}${res.messageId ? `, ${res.messageId}` : ""})`,
          sent_date: new Date().toISOString(),
        },
      ]);
    }

    return json({
      ok: res.ok,
      sent: res.ok,
      tableNumber: tableNumberText,
      error: res.ok ? undefined : (res.error || `whatsapp:${res.status}`),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message, sent: false }, { status: 500 });
  }
});
