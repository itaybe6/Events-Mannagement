// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";
import {
  buildGuestVars,
  buildWaPayload,
  getEventDisplayTitle,
  getWhatsappToken,
  normalizeWaPhone,
  sendWaMessage,
  type WaTemplate,
  type WaParams,
} from "../_shared/whatsapp.ts";

type GuestStatus = "מגיע" | "אישר" | "ממתין" | "אולי מגיע" | "לא מגיע" | "לא מגיעים";

const PENDING_STATUSES: GuestStatus[] = ["ממתין"];
const COMING_STATUSES: GuestStatus[] = ["מגיע", "אישר"];
const DECLINED_STATUSES: GuestStatus[] = ["לא מגיע", "לא מגיעים"];
const MAYBE_STATUSES: GuestStatus[] = ["אולי מגיע"];

function normalizeFilterToStatuses(filter: string): GuestStatus[] | null {
  const f = String(filter || "").trim();
  if (!f || f === "all") return null;
  if (f === "pending" || f === "ממתין") return PENDING_STATUSES;
  if (f === "coming" || f === "confirmed" || f === "מגיע") return COMING_STATUSES;
  if (f === "not_coming" || f === "declined" || f === "לא מגיע") return DECLINED_STATUSES;
  if (f === "maybe" || f === "אולי מגיע") return MAYBE_STATUSES;
  return [];
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", ...(init?.headers ?? {}) },
  });
}

function getOriginFromUrl(raw: unknown) {
  const value = String(raw ?? "").trim().replace(/\/+$/, "");
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    const match = value.match(/^(https?:\/\/[^/]+)/i);
    return match?.[1] ?? "";
  }
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const GUESTS_SELECT = "id, name, phone, status, invitation_code, invitation_token";

async function fetchAllGuests(adminClient: any, eventId: string, guestIds: string[], statusList: string[] | null) {
  const all: any[] = [];
  if (guestIds.length > 0) {
    for (const ids of chunk(guestIds, 100)) {
      const { data, error } = await adminClient.from("guests").select(GUESTS_SELECT).eq("event_id", eventId).in("id", ids);
      if (error) throw new Error(error.message);
      if (data) all.push(...data);
    }
    return all;
  }
  const pageSize = 200;
  for (let from = 0; ; from += pageSize) {
    let q = adminClient.from("guests").select(GUESTS_SELECT).eq("event_id", eventId);
    if (statusList && statusList.length > 0) {
      q = statusList.length === 1 ? q.eq("status", statusList[0]) : q.in("status", statusList);
    }
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
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
    if (!waPhoneId) {
      return json({ error: "Missing WhatsApp phone id (WHATSAPP_PHONE_NUMBER_ID)" }, { status: 500 });
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
      if (res.data?.user?.id) userId = res.data.user.id;
      if (!userId) {
        const res2 = await adminClient.auth.getUser(bearerToken);
        if (res2.data?.user?.id) userId = res2.data.user.id;
      }
    }
    if (!userId) return json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as any;
    const eventId = String(body?.eventId ?? "").trim();
    const templateId = String(body?.templateId ?? "").trim();
    const filterStatus = String(body?.filterStatus ?? "all").trim();
    const guestIds = Array.isArray(body?.guestIds) ? body.guestIds.map(String).map((s: string) => s.trim()).filter(Boolean) : [];
    const whatsappParams: WaParams = (body?.whatsappParams ?? {}) as WaParams;
    let template: WaTemplate | null = (body?.template ?? null) as WaTemplate | null;

    if (!eventId) return json({ error: "Missing eventId" }, { status: 400 });

    const statusList = normalizeFilterToStatuses(filterStatus);
    if (statusList?.length === 0) return json({ error: "Invalid filterStatus" }, { status: 400 });

    // Permission: admin or the event owner.
    const [{ data: profile }, { data: eventRow, error: eventError }] = await Promise.all([
      adminClient.from("users").select("id, user_type").eq("id", userId).maybeSingle(),
      adminClient
        .from("events")
        .select("id, user_id, title, date, location, city, groom_name, bride_name, rsvp_link, invitation_image_url")
        .eq("id", eventId)
        .maybeSingle(),
    ]);
    if (eventError) return json({ error: eventError.message }, { status: 500 });
    if (!eventRow) return json({ error: "Event not found" }, { status: 404 });
    const userType = String((profile as any)?.user_type ?? "");
    const ownerId = String((eventRow as any)?.user_id ?? "");
    const isAllowed = userType === "admin" || (userType === "event_owner" && ownerId === userId);
    if (!isAllowed) return json({ error: "Forbidden" }, { status: 403 });

    // Resolve the template from the registry if only an id was passed.
    if (!template && templateId) {
      const { data: tpl, error: tplErr } = await adminClient.from("whatsapp_templates").select("*").eq("id", templateId).maybeSingle();
      if (tplErr) return json({ error: tplErr.message }, { status: 500 });
      template = tpl as any;
    }
    if (!template || !template.template_name) {
      return json({ error: "Missing WhatsApp template" }, { status: 400 });
    }

    // Permanent WhatsApp token comes from the WHATSAPP_ACCESS_TOKEN Edge secret.
    if (!waToken) {
      return json({ error: "missing_whatsapp_token" }, { status: 500 });
    }

    // Daily quota check.
    const { data: settings } = await adminClient.from("whatsapp_settings").select("daily_quota").eq("id", true).maybeSingle();
    const dailyQuota = Number((settings as any)?.daily_quota);
    let remainingQuota = Number.isFinite(dailyQuota) && dailyQuota > 0 ? dailyQuota : Number.POSITIVE_INFINITY;
    if (Number.isFinite(remainingQuota)) {
      const { data: sentToday } = await adminClient.rpc("whatsapp_sends_today");
      const used = Number(sentToday) || 0;
      remainingQuota = Math.max(0, dailyQuota - used);
    }

    let guests: any[] = [];
    try {
      guests = await fetchAllGuests(adminClient, eventId, guestIds, statusList);
    } catch (e) {
      return json({ error: `Failed to load guests: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
    }

    const eventRsvpBase = getOriginFromUrl((eventRow as any)?.rsvp_link);
    const baseUrl = eventRsvpBase || String(body?.baseUrl ?? "").trim().replace(/\/+$/, "") || String(Deno.env.get("SITE_BASE_URL") ?? "").trim().replace(/\/+$/, "");

    const eventTitle = getEventDisplayTitle((eventRow as any)?.title);
    const eventDateRaw = (eventRow as any)?.date;
    const eventDate = eventDateRaw ? new Date(eventDateRaw) : new Date("invalid");
    const eventDateText = Number.isFinite(eventDate.getTime())
      ? eventDate.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })
      : "";
    const location = String((eventRow as any)?.location ?? "").trim();
    const city = String((eventRow as any)?.city ?? "").trim();
    const eventLocationText = [location, city].filter(Boolean).join(", ");
    const groomName = String((eventRow as any)?.groom_name ?? "").trim();
    const brideName = String((eventRow as any)?.bride_name ?? "").trim();
    const coupleNames = groomName && brideName ? `${groomName} ו${brideName}` : groomName || brideName || "";

    // Default header image: explicit param > event invitation image.
    const resolvedParams: WaParams = { ...whatsappParams };
    if (String(template.header_type ?? "none") === "image" && !String(resolvedParams.header_image_url ?? "").trim()) {
      const evImg = String((eventRow as any)?.invitation_image_url ?? "").trim();
      if (evImg) resolvedParams.header_image_url = evImg;
    }

    const failures: Array<{ guestId: string; phone?: string | null; reason: string }> = [];
    let sent = 0;
    let failed = 0;
    let skippedQuota = 0;

    for (const g of guests) {
      const rawPhone = g.phone;
      const n = normalizeWaPhone(rawPhone);
      if (!String(rawPhone ?? "").trim()) {
        failures.push({ guestId: String(g.id), phone: null, reason: "missing_phone" });
        continue;
      }
      if (!n.ok) {
        failures.push({ guestId: String(g.id), phone: rawPhone ?? null, reason: "invalid_phone" });
        continue;
      }
      if (remainingQuota <= 0) {
        skippedQuota += 1;
        failures.push({ guestId: String(g.id), phone: n.value, reason: "daily_quota_reached" });
        continue;
      }

      const vars = buildGuestVars({
        guest: g,
        baseUrl,
        eventTitle,
        eventDateText,
        eventLocationText,
        groomName,
        brideName,
        coupleNames,
      });
      const invitationCode = String(g.invitation_code ?? g.invitation_token ?? "").trim();
      const payload = buildWaPayload({ to: n.value, template, params: resolvedParams, vars, invitationCode });

      const res = await sendWaMessage({ phoneNumberId: waPhoneId, accessToken: waToken, payload });
      if (res.ok) {
        sent += 1;
        remainingQuota -= 1;
      } else {
        failed += 1;
        failures.push({ guestId: String(g.id), phone: n.value, reason: `whatsapp:${res.error || res.status}${res.body ? `:${res.body}` : ""}` });
      }

      await adminClient.from("messages").insert({
        event_id: eventId,
        type: "וואטסאפ",
        recipient: String(g.name ?? "").trim() || "מוזמן",
        phone: n.value,
        status: res.ok ? `נשלח${res.messageId ? ` (${res.messageId})` : ""}` : `נכשל (${res.error || res.status})`,
        sent_date: new Date().toISOString(),
      }).then(({ error }) => {
        if (error) console.warn("messages insert failed", error);
      });
    }

    return json({
      ok: failed === 0,
      result: {
        totalSelected: guests.length,
        sent,
        failed,
        skippedQuota,
        remainingQuota: Number.isFinite(remainingQuota) ? remainingQuota : null,
        failures: failures.slice(0, 50),
        failuresCount: failures.length,
      },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
});
