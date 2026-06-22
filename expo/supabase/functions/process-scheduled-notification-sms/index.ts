// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";
import {
  buildGuestVars,
  buildWaPayload,
  getWhatsappToken,
  normalizeWaPhone,
  sendWaMessage,
} from "../_shared/whatsapp.ts";

type GuestStatus =
  | "מגיע"
  | "אישר"
  | "ממתין"
  | "מתלבטים"
  | "לא מגיע"
  | "לא מגיעים"
  | "נשלחה הודעה";

const PENDING_STATUSES: GuestStatus[] = ["ממתין"];

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
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

function normalizeBaseUrl(input?: string) {
  const raw = String(input ?? "").trim();
  return raw ? raw.replace(/\/+$/, "") : "";
}

function getOriginFromUrl(raw: unknown) {
  const value = normalizeBaseUrl(String(raw ?? ""));
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    const match = value.match(/^(https?:\/\/[^/]+)/i);
    return match?.[1] ?? "";
  }
}

function buildDirectionsShortLink(baseUrl: string, token: string) {
  const base = normalizeBaseUrl(baseUrl);
  const cleanToken = String(token ?? "").trim();
  if (!base || !cleanToken) return "";
  return `${base}/w/${encodeURIComponent(cleanToken)}`;
}

function buildDirectionsDetailsText(baseUrl: string, token: string) {
  const shortLink = buildDirectionsShortLink(baseUrl, token);
  return shortLink ? `לניווט ב-Waze: ${shortLink}` : "";
}

function fillTemplate(template: string, vars: Record<string, string>) {
  const stripMarks = (s: string) =>
    String(s || "").replace(/[\u200E\u200F\u202A-\u202E]/g, "").trim();

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
    return Object.prototype.hasOwnProperty.call(vars, key)
      ? String((vars as any)[key] ?? "")
      : full;
  });

  out = out.replace(/\{(?!\{)\s*([^{}]+?)\s*\}(?!\})/g, (full, inner) => {
    const key = stripMarks(inner);
    return Object.prototype.hasOwnProperty.call(vars, key)
      ? String((vars as any)[key] ?? "")
      : full;
  });

  return out;
}

const EVENT_TYPE_PREFIXES = ["חתונה", "בר מצווה", "בת מצווה", "ברית", "בריתה", "אירוע חברה"] as const;

function getEventDisplayTitle(rawTitle: unknown) {
  const raw = String(rawTitle ?? "").trim();
  if (!raw) return "";
  for (const eventType of EVENT_TYPE_PREFIXES) {
    const withoutPrefix = raw.replace(new RegExp(`^${eventType}\\s*[–—-]\\s*`), "").trim();
    if (withoutPrefix !== raw) return withoutPrefix || raw;
  }
  return raw;
}

function normalizePhone(
  raw: unknown,
): { ok: true; value: string } | { ok: false; value: string } {
  const s = String(raw ?? "").trim();
  const cleaned = s.replace(/[^\d+]/g, "");
  const digits = cleaned.replace(/\D/g, "");
  if (!digits || digits.length < 7) return { ok: false, value: cleaned };
  return { ok: true, value: cleaned };
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function makePulseemSendId(eventId: string, batchIndex: number) {
  const ev = String(eventId || "").replace(/-/g, "").slice(0, 10);
  const t = Date.now().toString(36);
  const r = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const bi = (batchIndex + 1).toString(36);
  const id = `auto-${ev}-${t}-${r}-${bi}`;
  return id.length <= 50 ? id : id.slice(0, 50);
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

type ClaimedJob = {
  run_id: string;
  notification_setting_id?: string;
  setting_id?: string;
  event_id: string;
  notification_type: string;
  channel?: string;
  message_content: string;
  recipient_guest_ids: string[];
  scheduled_for?: string;
  scheduled_for_at?: string;
  whatsapp_template?: any;
  whatsapp_params?: any;
};

type RecipientRunRow = {
  run_id: string;
  event_id: string;
  guest_id: string;
  status: "sent" | "failed" | "skipped";
  phone?: string | null;
  sent_at?: string | null;
  error?: string | null;
};

async function setRunStatus(
  adminClient: any,
  runId: string,
  patch: { status: string; result?: any; error?: string | null },
) {
  const updatePayload: any = { status: patch.status };
  if (patch.result !== undefined) updatePayload.result = patch.result;
  if (patch.error !== undefined) updatePayload.error = patch.error;
  const { error } = await adminClient
    .from("scheduled_notification_sms_runs")
    .update(updatePayload)
    .eq("id", runId);
  if (error) console.warn("Failed to update run status:", { runId, error });
}

async function upsertRecipientRunRows(adminClient: any, rows: RecipientRunRow[]) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (list.length === 0) return;
  // Supabase has payload limits; chunk to be safe.
  const batches = chunk(list, 500);
  for (const b of batches) {
    const { error } = await adminClient
      .from("scheduled_notification_sms_run_recipients")
      .upsert(b, { onConflict: "run_id,guest_id" });
    if (error) {
      console.warn("Failed to upsert recipient run rows:", { error });
      // best-effort; don't fail the whole job
    }
  }
}

async function finalizeCatchupQueueForRun(adminClient: any, runId: string) {
  const id = String(runId || "").trim();
  if (!id) return;
  try {
    const { error } = await adminClient.rpc("finalize_sms_catchup_queue_for_run", { p_run_id: id });
    if (error) {
      // If the migration wasn't applied yet, environments may not have this RPC.
      // Keep scheduler backward-compatible.
      console.warn("Failed to finalize catchup queue:", { runId: id, error });
    }
  } catch (e) {
    console.warn("Failed to finalize catchup queue (exception):", { runId: id, e });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  try {
    const cronSecret = String(Deno.env.get("SCHEDULED_SMS_CRON_SECRET") ?? "").trim();
    const supabaseUrl = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
    const supabaseServiceKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
    const pulseemApiKey = String(Deno.env.get("PULSEEM_API_KEY") ?? "").trim();
    const pulseemFromNumber = String(Deno.env.get("PULSEEM_FROM_NUMBER") ?? "").trim();

    const missing: string[] = [];
    if (!cronSecret) missing.push("SCHEDULED_SMS_CRON_SECRET");
    if (!supabaseUrl) missing.push("SUPABASE_URL");
    if (!supabaseServiceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    if (!pulseemApiKey) missing.push("PULSEEM_API_KEY");
    // SITE_BASE_URL is optional; only required when message uses `{link}`.

    if (missing.length > 0) {
      console.error("Scheduler env is missing required secrets:", { missing });
      return json({ error: "missing_required_env", missing }, { status: 500 });
    }

    const providedSecret = String(req.headers.get("x-cron-secret") ?? "").trim();
    if (!providedSecret || providedSecret !== cronSecret) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    // SITE_BASE_URL is only required when the message actually needs `{link}`.
    // Don't hard-fail the whole scheduler if it's missing.
    const configuredBaseUrl = normalizeBaseUrl(
      String(Deno.env.get("SITE_BASE_URL") ?? Deno.env.get("EXPO_PUBLIC_SITE_BASE_URL") ?? "")
    );

    const body = (await req.json().catch(() => ({}))) as any;
    const limitRaw = Number(body?.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(100, Math.floor(limitRaw)))
      : 25;
    const dryRun = Boolean(body?.dryRun);

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // WhatsApp Cloud API secrets (optional; only needed when WhatsApp steps are due).
    // Permanent token comes from the WHATSAPP_ACCESS_TOKEN Edge secret.
    const waToken = getWhatsappToken();
    const waPhoneId = String(Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "").trim();

    const { data: jobs, error: claimError } = await adminClient.rpc(
      "claim_due_sms_notification_settings",
      { p_limit: limit },
    );
    if (claimError) return json({ error: claimError.message }, { status: 500 });

    const claimed: ClaimedJob[] = Array.isArray(jobs) ? jobs : [];
    if (claimed.length === 0) {
      return json({ ok: true, processed: 0, dryRun });
    }

    // Resolve the daily WhatsApp quota once per invocation.
    let waRemainingQuota = Number.POSITIVE_INFINITY;
    {
      const { data: settings } = await adminClient
        .from("whatsapp_settings")
        .select("daily_quota")
        .eq("id", true)
        .maybeSingle();
      const dailyQuota = Number((settings as any)?.daily_quota);
      if (Number.isFinite(dailyQuota) && dailyQuota > 0) {
        const { data: sentToday } = await adminClient.rpc("whatsapp_sends_today");
        waRemainingQuota = Math.max(0, dailyQuota - (Number(sentToday) || 0));
      }
    }

    const pulseemUrl = "https://api.pulseem.com/api/v1/SmsApi/SendSms";

    let processed = 0;
    let totalSent = 0;
    let totalFailed = 0;

    // Cache events across runs within this invocation.
    const eventCache = new Map<string, any>();

    for (const job of claimed) {
      processed += 1;
      const runId = String(job.run_id || "").trim();
      const eventId = String(job.event_id || "").trim();
      const notificationType = String(job.notification_type || "").trim();
      const messageTemplate = String(job.message_content ?? "").trim();
      const recipientIds = Array.isArray(job.recipient_guest_ids)
        ? job.recipient_guest_ids.map((x) => String(x))
        : [];
      const scheduledFor =
        job.scheduled_for_at ? String(job.scheduled_for_at) : job.scheduled_for ? String(job.scheduled_for) : "";
      const channel = String(job.channel || "SMS").trim().toUpperCase();
      const isWhatsapp = channel === "WHATSAPP";

      if (!runId || !eventId || (!isWhatsapp && !messageTemplate)) {
        if (runId) {
          await setRunStatus(adminClient, runId, {
            status: "failed",
            error: !messageTemplate ? "missing_message_content" : "missing_identifiers",
          });
        }
        continue;
      }

      // For non-reminder_2, empty list should never send.
      const isReminder2 = notificationType === "reminder_2";
      if (!isReminder2 && recipientIds.length === 0) {
        await setRunStatus(adminClient, runId, { status: "skipped", error: "empty_recipient_list" });
        continue;
      }

      await setRunStatus(adminClient, runId, { status: "sending", error: null });

      if (dryRun) {
        await setRunStatus(adminClient, runId, {
          status: "sent",
          result: { dryRun: true, eventId, notificationType, recipientCount: recipientIds.length },
        });
        continue;
      }

      // Load event
      let eventRow = eventCache.get(eventId);
      if (!eventRow) {
        const { data: ev, error: evErr } = await adminClient
          .from("events")
          .select("id, title, date, location, city, groom_name, bride_name, rsvp_link, invitation_image_url")
          .eq("id", eventId)
          .maybeSingle();
        if (evErr || !ev) {
          await setRunStatus(adminClient, runId, {
            status: "failed",
            error: evErr?.message || "event_not_found",
          });
          continue;
        }
        eventRow = ev;
        eventCache.set(eventId, eventRow);
      }

      // Load guests
      let q = adminClient
        .from("guests")
        .select("id, name, phone, status, invitation_code, invitation_token")
        .eq("event_id", eventId);

      if (recipientIds.length > 0) {
        q = q.in("id", recipientIds);
      } else if (isReminder2) {
        // reminder_2: when list is empty -> send to all pending guests.
        q = q.in("status", PENDING_STATUSES as any);
      }

      const { data: guests, error: guestsError } = await q;
      if (guestsError) {
        await setRunStatus(adminClient, runId, { status: "failed", error: guestsError.message });
        continue;
      }

      const list = Array.isArray(guests) ? guests : [];
      if (list.length === 0) {
        await setRunStatus(adminClient, runId, { status: "skipped", error: "no_matching_guests" });
        continue;
      }

      const eventTitle = getEventDisplayTitle(eventRow?.title);
      const eventDateRaw = eventRow?.date;
      const eventDate = eventDateRaw ? new Date(eventDateRaw) : new Date("invalid");
      const eventDateText = Number.isFinite(eventDate.getTime())
        ? eventDate.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })
        : "";

      const location = String(eventRow?.location ?? "").trim();
      const city = String(eventRow?.city ?? "").trim();
      const eventLocationText = [location, city].filter(Boolean).join(", ");

      const groomName = String(eventRow?.groom_name ?? "").trim();
      const brideName = String(eventRow?.bride_name ?? "").trim();
      const coupleNames = groomName && brideName ? `${groomName} ו${brideName}` : groomName || brideName || "";
      const eventRsvpBase = getOriginFromUrl(eventRow?.rsvp_link);
      const baseUrl = eventRsvpBase || configuredBaseUrl;

      const failures: Array<{ guestId: string; phone?: string | null; reason: string }> = [];

      // -----------------------------------------------------------------
      // WhatsApp channel: send via Meta Cloud API templates (respect quota).
      // -----------------------------------------------------------------
      if (isWhatsapp) {
        if (!waToken || !waPhoneId) {
          await setRunStatus(adminClient, runId, { status: "failed", error: "missing_whatsapp_secrets" });
          continue;
        }
        const template = job.whatsapp_template;
        if (!template || !template.template_name) {
          await setRunStatus(adminClient, runId, { status: "failed", error: "missing_whatsapp_template" });
          continue;
        }
        const waParams: any = job.whatsapp_params || {};
        if (String(template.header_type ?? "none") === "image" && !String(waParams.header_image_url ?? "").trim()) {
          const evImg = String(eventRow?.invitation_image_url ?? "").trim();
          if (evImg) waParams.header_image_url = evImg;
        }

        let waSent = 0;
        let waFailed = 0;
        let waSkippedQuota = 0;

        for (const g of list) {
          const nowIso = new Date().toISOString();
          const n = normalizeWaPhone(g.phone);
          if (!String(g.phone ?? "").trim()) {
            failures.push({ guestId: String(g.id), phone: null, reason: "missing_phone" });
            await upsertRecipientRunRows(adminClient, [{ run_id: runId, event_id: eventId, guest_id: String(g.id), status: "skipped", phone: null, sent_at: null, error: "missing_phone" }]);
            continue;
          }
          if (!n.ok) {
            failures.push({ guestId: String(g.id), phone: g.phone, reason: "invalid_phone" });
            await upsertRecipientRunRows(adminClient, [{ run_id: runId, event_id: eventId, guest_id: String(g.id), status: "skipped", phone: n.value, sent_at: null, error: "invalid_phone" }]);
            continue;
          }
          if (waRemainingQuota <= 0) {
            waSkippedQuota += 1;
            failures.push({ guestId: String(g.id), phone: n.value, reason: "daily_quota_reached" });
            await upsertRecipientRunRows(adminClient, [{ run_id: runId, event_id: eventId, guest_id: String(g.id), status: "skipped", phone: n.value, sent_at: null, error: "daily_quota_reached" }]);
            continue;
          }

          const vars = buildGuestVars({ guest: g, baseUrl, eventTitle, eventDateText, eventLocationText, groomName, brideName, coupleNames });
          const invitationCode = String(g.invitation_code ?? g.invitation_token ?? "").trim();
          const payload = buildWaPayload({ to: n.value, template, params: waParams, vars, invitationCode });
          const res = await sendWaMessage({ phoneNumberId: waPhoneId, accessToken: waToken, payload });

          if (res.ok) {
            waSent += 1;
            waRemainingQuota -= 1;
          } else {
            waFailed += 1;
            failures.push({ guestId: String(g.id), phone: n.value, reason: `whatsapp:${res.error || res.status}` });
          }
          await upsertRecipientRunRows(adminClient, [{
            run_id: runId,
            event_id: eventId,
            guest_id: String(g.id),
            status: res.ok ? "sent" : "failed",
            phone: n.value,
            sent_at: nowIso,
            error: res.ok ? null : `whatsapp:${res.error || res.status}`,
          }]);
          const { error: logError } = await adminClient.from("messages").insert({
            event_id: eventId,
            type: "וואטסאפ",
            recipient: String(g.name ?? "").trim() || "מוזמן",
            phone: n.value,
            status: res.ok ? `נשלח${res.messageId ? ` (${res.messageId})` : ""}` : `נכשל (${res.error || res.status})`,
            sent_date: nowIso,
          });
          if (logError) console.warn("Failed to insert WhatsApp messages log:", logError);
        }

        totalSent += waSent;
        totalFailed += waFailed;

        await setRunStatus(adminClient, runId, {
          status: waFailed === 0 ? "sent" : "failed",
          result: {
            channel: "WHATSAPP",
            notificationType,
            scheduledFor,
            totalSelected: list.length,
            sent: waSent,
            failed: waFailed,
            skippedQuota: waSkippedQuota,
            failuresSample: failures.slice(0, 20),
            failuresCount: failures.length,
          },
          error: waFailed === 0 ? null : "some_messages_failed",
        });
        continue;
      }

      // Only require an invitation token when the message actually needs the `{link}` placeholder.
      // Many scheduled messages may contain a fixed URL (or no URL at all), in which case token is not required.
      const needsInvitationToken = (() => {
        const t = String(messageTemplate ?? "");
        return (
          t.includes("{link}") ||
          t.includes("{{link}}") ||
          t.includes("{פרטי הגעה}") ||
          t.includes("{{פרטי הגעה}}") ||
          t.includes("{פרטי_הגעה}") ||
          t.includes("{{פרטי_הגעה}}")
        );
      })();
      if (needsInvitationToken && !baseUrl) {
        await setRunStatus(adminClient, runId, { status: "failed", error: "missing_site_base_url" });
        continue;
      }

      const prepared = list.map((g: any) => {
        const token = String(g.invitation_code ?? g.invitation_token ?? "").trim();
        const link = token && baseUrl ? `${baseUrl}/i/${token}` : "";
        const directionsDetails = token ? buildDirectionsDetailsText(baseUrl, token) : "";
        const rawPhone = g.phone;
        const n = normalizePhone(rawPhone);
        const phoneOk = n.ok ? n.value : "";
        const hasPhone = Boolean(String(rawPhone ?? "").trim());
        const hasToken = Boolean(token);
        const fullName = String(g.name ?? "").trim();
        const firstName = fullName ? fullName.split(/\s+/)[0] : "";
        const text = fillTemplate(messageTemplate, {
          name: fullName,
          link,
          event: eventTitle,
          event_date: eventDateText,
          date: eventDateText,
          "שם_פרטי": firstName || fullName,
          "שם_אירוע": eventTitle,
          "תאריך": eventDateText,
          "מיקום": eventLocationText,
          "פרטי הגעה": directionsDetails,
          "פרטי_הגעה": directionsDetails,
          "שם_חתן": groomName,
          "שם_כלה": brideName,
          "שמות_חתן_כלה": coupleNames,
        });
        return {
          id: String(g.id),
          name: fullName,
          phoneRaw: rawPhone,
          hasPhone,
          phoneOk,
          phoneValid: n.ok,
          hasToken,
          link,
          text,
        };
      });

      const sendable = prepared.filter((p) => {
        if (!p.hasPhone) {
          failures.push({ guestId: p.id, phone: p.phoneRaw ?? null, reason: "missing_phone" });
          return false;
        }
        if (!p.phoneValid) {
          failures.push({ guestId: p.id, phone: p.phoneRaw ?? null, reason: "invalid_phone" });
          return false;
        }
        if (needsInvitationToken && !p.hasToken) {
          failures.push({ guestId: p.id, phone: p.phoneRaw ?? null, reason: "missing_invitation_token" });
          return false;
        }
        return true;
      });

      // Persist per-recipient skipped reasons (missing phone/token etc).
      // These are not "Pulseem failures", but they explain why a guest didn't get an SMS.
      if (failures.length > 0) {
        const nowIso = new Date().toISOString();
        await upsertRecipientRunRows(
          adminClient,
          failures.map((f) => ({
            run_id: runId,
            event_id: eventId,
            guest_id: String(f.guestId),
            status: "skipped",
            phone: f.phone ? String(f.phone) : null,
            sent_at: null,
            error: String(f.reason || "skipped"),
          })),
        );
      }

      const batches = chunk(sendable, 200);

      let sent = 0;
      let failed = 0;
      const pulseemSendIds: string[] = [];
      const pulseemResponses: Array<{ sendId: string; httpStatus: number; ok: boolean; bodySnippet?: string }> = [];

      for (let bi = 0; bi < batches.length; bi++) {
        const batch = batches[bi];
        const sendId = makePulseemSendId(eventId, bi);
        pulseemSendIds.push(sendId);

        const payload: any = {
          sendId,
          isAsync: false,
          smsSendData: {
            toNumberList: batch.map((b) => b.phoneOk),
            referenceList: batch.map((b) => b.id),
            textList: batch.map((b) => b.text),
          },
        };
        if (pulseemFromNumber) payload.smsSendData.fromNumber = pulseemFromNumber;

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
        const snippet = respText ? respText.slice(0, 500) : "";
        const parsed = pulseemBodyLooksOk(respText);
        const effectiveOk = resp.ok && parsed.ok;

        pulseemResponses.push({ sendId, httpStatus: resp.status, ok: effectiveOk, bodySnippet: snippet || undefined });
        if (!effectiveOk) {
          const nowIso = new Date().toISOString();
          for (const b of batch) {
            const why = parsed.reason ? `pulseem:${parsed.reason}` : `pulseem_http_${resp.status}`;
            failures.push({ guestId: b.id, phone: b.phoneOk, reason: `${why}${respText ? `:${respText}` : ""}` });
          }
          failed += batch.length;

          await upsertRecipientRunRows(
            adminClient,
            batch.map((b) => ({
              run_id: runId,
              event_id: eventId,
              guest_id: String(b.id),
              status: "failed",
              phone: b.phoneOk ? String(b.phoneOk) : null,
              sent_at: nowIso,
              error: parsed.reason ? `pulseem:${parsed.reason}` : `pulseem_http_${resp.status}`,
            })),
          );
        } else {
          const nowIso = new Date().toISOString();
          sent += batch.length;
          await upsertRecipientRunRows(
            adminClient,
            batch.map((b) => ({
              run_id: runId,
              event_id: eventId,
              guest_id: String(b.id),
              status: "sent",
              phone: b.phoneOk ? String(b.phoneOk) : null,
              sent_at: nowIso,
              error: null,
            })),
          );
        }

        // Best-effort log to messages table
        const statusText = effectiveOk ? `נשלח (sendId=${sendId})` : `נכשל (sendId=${sendId})`;
        const rows = batch.map((b) => ({
          event_id: eventId,
          type: "SMS",
          recipient: b.name || "מוזמן",
          phone: b.phoneOk,
          status: statusText,
          sent_date: new Date().toISOString(),
        }));
        const { error: logError } = await adminClient.from("messages").insert(rows);
        if (logError) console.warn("Failed to insert messages log:", logError);
      }

      totalSent += sent;
      totalFailed += failed;

      const resultToStore = {
        notificationType,
        scheduledFor,
        totalSelected: prepared.length,
        totalValidPhone: sendable.length,
        sent,
        failed,
        pulseemSendIds,
        pulseemResponses,
        failuresSample: failures.slice(0, 20),
        failuresCount: failures.length,
      };

      await setRunStatus(adminClient, runId, {
        status: failed === 0 ? "sent" : "failed",
        result: resultToStore,
        error: failed === 0 ? null : "some_messages_failed",
      });

      // If this run was a catch-up batch for "reminder_1", update the queue rows accordingly.
      await finalizeCatchupQueueForRun(adminClient, runId);
    }

    return json({ ok: true, processed, totalSent, totalFailed, dryRun });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, { status: 500 });
  }
});

