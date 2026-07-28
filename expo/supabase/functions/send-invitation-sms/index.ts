// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";
import { loadTableNumberMap, resolveGuestTableNumberText } from "../_shared/whatsapp.ts";

// Support legacy / UI variations across environments.
type GuestStatus =
  | "מגיע"
  | "אישר"
  | "ממתין"
  | "מתלבטים"
  | "לא מגיע"
  | "לא מגיעים"
  | "נשלחה הודעה";

type FilterStatus =
  | "all"
  | "pending"
  | "confirmed"
  | "declined"
  | GuestStatus;

// "pending" should mean "hasn't responded yet" -> status "ממתין".
const PENDING_STATUSES: GuestStatus[] = ["ממתין"];
const CONFIRMED_STATUSES: GuestStatus[] = ["מגיע", "אישר"];
const DECLINED_STATUSES: GuestStatus[] = ["לא מגיע", "לא מגיעים"];

function normalizeFilterToStatuses(filter: string): GuestStatus[] | null {
  const f = String(filter || "").trim();
  if (!f || f === "all") return null;
  if (f === "pending") return PENDING_STATUSES;
  if (f === "confirmed") return CONFIRMED_STATUSES;
  if (f === "declined") return DECLINED_STATUSES;
  if ([...PENDING_STATUSES, ...CONFIRMED_STATUSES, ...DECLINED_STATUSES].includes(f as any)) return [f as any];
  return [];
}

type SendInvitationSmsRequest = {
  eventId: string;
  guestIds?: string[];
  filterStatus?: FilterStatus;
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
  pulseemSendIds: string[];
  pulseemResponses: Array<{ sendId: string; httpStatus: number; ok: boolean; bodySnippet?: string }>;
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

function buildDirectionsShortLink(baseUrl: string, token: string) {
  const base = String(baseUrl ?? "").trim().replace(/\/+$/, "");
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

  // Fast-path exact replacements (both `{key}` and `{{key}}`)
  for (const [kRaw, vRaw] of Object.entries(vars)) {
    const k = stripMarks(kRaw);
    const v = String(vRaw ?? "");
    out = out.split(`{${k}}`).join(v);
    out = out.split(`{{${k}}}`).join(v);
    out = out.split(`(${k})`).join(v);
  }

  // Robust replacement for `{{ ... }}` with possible spaces/RTL marks inside.
  out = out.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (full, inner) => {
    const key = stripMarks(inner);
    return Object.prototype.hasOwnProperty.call(vars, key) ? String((vars as any)[key] ?? "") : full;
  });

  // Robust replacement for `{ ... }` (single braces), but avoid `{{...}}`.
  out = out.replace(/\{(?!\{)\s*([^{}]+?)\s*\}(?!\})/g, (full, inner) => {
    const key = stripMarks(inner);
    return Object.prototype.hasOwnProperty.call(vars, key) ? String((vars as any)[key] ?? "") : full;
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

function makePulseemSendId(eventId: string, batchIndex: number) {
  // Pulseem often has strict length limits on sendId (keep <= 50).
  const ev = String(eventId || "").replace(/-/g, "").slice(0, 10);
  const t = Date.now().toString(36);
  const r = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const bi = (batchIndex + 1).toString(36);
  const id = `inv-${ev}-${t}-${r}-${bi}`;
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

// The edge runtime occasionally fails outbound requests (even to the project's own
// PostgREST endpoint) with a transient "error sending request". Retry such failures
// with backoff so one flaky connection doesn't abort the whole invocation.
function isTransientNetworkError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  return (
    msg.includes("error sending request") ||
    msg.includes("connection") ||
    msg.includes("connect") ||
    msg.includes("reset") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("aborted") ||
    msg.includes("broken pipe") ||
    msg.includes("unexpected eof") ||
    msg.includes("stream") ||
    msg.includes("dns") ||
    msg.includes("tls") ||
    msg.includes("handshake") ||
    msg.includes("os error")
  );
}

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`withRetry[${label}] attempt ${i + 1}/${attempts} failed: ${msg}`);
      if (i === attempts - 1 || !isTransientNetworkError(e)) break;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

// Fetch guests without ever building a huge GET URL or a single oversized response.
// When explicit guestIds are given we chunk the `in(...)` filter (a long id list in
// the query string overflows URL limits and fails with "error sending request").
// Otherwise we page through the result set so no single response is too large.
const GUESTS_SELECT = "id, name, phone, status, invitation_code, invitation_token, table_id";

async function fetchAllGuests(
  adminClient: any,
  eventId: string,
  guestIds: string[],
  statusList: string[] | null
): Promise<any[]> {
  const all: any[] = [];

  if (guestIds.length > 0) {
    for (const ids of chunk(guestIds, 100)) {
      const { data, error } = await withRetry("query.guests.in", () =>
        adminClient.from("guests").select(GUESTS_SELECT).eq("event_id", eventId).in("id", ids)
      );
      if (error) throw new Error(error.message);
      if (data) all.push(...data);
    }
    return all;
  }

  const pageSize = 200;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await withRetry("query.guests.page", () => {
      let q = adminClient.from("guests").select(GUESTS_SELECT).eq("event_id", eventId);
      if (statusList && statusList.length > 0) {
        q = statusList.length === 1 ? q.eq("status", statusList[0]) : q.in("status", statusList);
      }
      return q.range(from, to);
    });
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
      const res = await withRetry("auth.getUser", () => userClient.auth.getUser());
      authError = res.error;
      authData = res.data?.user ? ({ user: { id: res.data.user.id } } as any) : null;
    }

    if (!authData?.user?.id) {
      const res2 = await withRetry("admin.getUser", () => adminClient.auth.getUser(bearerToken));
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
    const filterStatus = String(filterStatusRaw).trim();
    const guestIds = Array.isArray(body.guestIds) ? body.guestIds.map(String).map((s) => s.trim()).filter(Boolean) : [];

    if (!eventId) return json({ error: "Missing eventId" }, { status: 400 });
    if (!messageTemplate) return json({ error: "Missing messageTemplate" }, { status: 400 });
    if (messageTemplate.length > 800) return json({ error: "messageTemplate too long" }, { status: 400 });
    const statusList = normalizeFilterToStatuses(filterStatus);
    if (statusList?.length === 0) {
      return json({ error: "Invalid filterStatus" }, { status: 400 });
    }

    const userId = authData.user.id;

    const [{ data: profile, error: profileError }, { data: eventRow, error: eventError }] = await Promise.all([
      withRetry("query.users", () =>
        adminClient.from("users").select("id, user_type").eq("id", userId).maybeSingle()
      ),
      withRetry("query.events", () =>
        adminClient
          .from("events")
          .select("id, user_id, title, date, location, city, groom_name, bride_name, rsvp_link")
          .eq("id", eventId)
          .maybeSingle()
      ),
    ]);
    if (profileError) return json({ error: profileError.message }, { status: 500 });
    if (eventError) return json({ error: eventError.message }, { status: 500 });
    if (!eventRow) return json({ error: "Event not found" }, { status: 404 });
    if (!profile) return json({ error: "User profile not found" }, { status: 403 });

    const userType = String((profile as any).user_type ?? "");
    const ownerId = String((eventRow as any).user_id ?? "");
    const isAllowed = userType === "admin" || (userType === "event_owner" && ownerId === userId);
    if (!isAllowed) return json({ error: "Forbidden" }, { status: 403 });

    // Avoid huge GET URLs (many ids) and oversized single responses: chunk/paginate.
    let guests: any[] = [];
    try {
      guests = await fetchAllGuests(adminClient, eventId, guestIds, statusList);
    } catch (guestsErr) {
      const m = guestsErr instanceof Error ? guestsErr.message : String(guestsErr);
      return json({ error: `Failed to load guests: ${m}` }, { status: 500 });
    }

    const eventRsvpBase = getOriginFromUrl((eventRow as any)?.rsvp_link);
    const baseUrl = eventRsvpBase || getBaseUrl(req, body.baseUrl);
    const needsBaseUrl = (() => {
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
    if (needsBaseUrl && !baseUrl) {
      return json({ error: "Missing baseUrl (pass from client or set SITE_BASE_URL secret)" }, { status: 400 });
    }

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

    const tableNumberById = await loadTableNumberMap(adminClient, eventId);

    const failures: SendInvitationSmsResult["failures"] = [];
    const prepared = (guests ?? []).map((g: any) => {
      const token = String(g.invitation_code ?? g.invitation_token ?? "").trim();
      const link = token ? `${baseUrl}/i/${token}` : "";
      const directionsDetails = token ? buildDirectionsDetailsText(baseUrl, token) : "";
      const rawPhone = g.phone;
      const n = normalizePhone(rawPhone);
      const phoneOk = n.ok ? n.value : "";
      const hasPhone = Boolean(String(rawPhone ?? "").trim());
      const hasToken = Boolean(token);
      const fullName = String(g.name ?? "").trim();
      const firstName = fullName ? fullName.split(/\s+/)[0] : "";
      const tableNumberText = resolveGuestTableNumberText(g, tableNumberById);
      const text = fillTemplate(messageTemplate, {
        // Common tokens used in UI
        name: fullName,
        link,
        table: tableNumberText,
        event: eventTitle,
        event_date: eventDateText,
        date: eventDateText,
        // Hebrew tokens used in the templates on the web screen
        "שם_פרטי": firstName || fullName,
        "שם_אירוע": eventTitle,
        "תאריך": eventDateText,
        "מיקום": eventLocationText,
        "פרטי הגעה": directionsDetails,
        "פרטי_הגעה": directionsDetails,
        "מספר_שולחן": tableNumberText,
        "שם_חתן": groomName,
        "שם_כלה": brideName,
        "שמות_חתן_כלה": coupleNames,
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
      if (needsBaseUrl && !p.hasToken) {
        failures.push({ guestId: p.id, phone: p.phoneRaw ?? null, reason: "missing_invitation_token" });
        return false;
      }
      return true;
    });

    const pulseemUrl = "https://api.pulseem.com/api/v1/SmsApi/SendSms";
    // Abort a single Pulseem request that hangs, so one slow/blocked batch can't
    // crash the whole invocation (the edge runtime is far from Pulseem's region).
    const PULSEEM_TIMEOUT_MS = 30000;

    let sent = 0;
    let failed = 0;
    const pulseemSendIds: string[] = [];
    const pulseemResponses: SendInvitationSmsResult["pulseemResponses"] = [];

    // Pulseem supports bulk lists; keep batches small to reduce per-request latency
    // and the chance of a timeout/connection reset on large synchronous sends.
    const batches = chunk(sendable, 50);
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
      // `fromNumber` can be omitted if your Pulseem account has a default sender.
      if (pulseemFromNumber) {
        payload.smsSendData.fromNumber = pulseemFromNumber;
      }

      // A network failure here must NOT bubble up and abort the whole request;
      // otherwise a single bad batch turns into an opaque 500 with no detail and
      // no per-recipient logging. Retry transient failures, then treat as failed.
      let resp: Response | null = null;
      let respText = "";
      let networkError = "";
      try {
        const out = await withRetry(`pulseem.batch_${bi}`, async () => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), PULSEEM_TIMEOUT_MS);
          try {
            const r = await fetch(pulseemUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                // Pulseem Swagger defines header name as `APIKey` (and some docs mention `X-Api-Key`).
                // Send both to be safe across accounts/environments.
                "APIKey": pulseemApiKey,
                "X-Api-Key": pulseemApiKey,
              },
              body: JSON.stringify(payload),
              signal: controller.signal,
            });
            const t = await r.text().catch(() => "");
            return { r, t };
          } finally {
            clearTimeout(timer);
          }
        });
        resp = out.r;
        respText = out.t;
      } catch (fetchErr) {
        networkError =
          fetchErr instanceof Error
            ? fetchErr.name === "AbortError"
              ? `timeout_after_${PULSEEM_TIMEOUT_MS}ms`
              : fetchErr.message
            : String(fetchErr);
      }

      const snippet = respText ? respText.slice(0, 500) : "";
      const httpStatus = resp?.status ?? 0;
      const parsed = networkError
        ? { ok: false, reason: `network:${networkError}` }
        : pulseemBodyLooksOk(respText);
      const effectiveOk = Boolean(resp?.ok) && parsed.ok;

      pulseemResponses.push({
        sendId,
        httpStatus,
        ok: effectiveOk,
        bodySnippet: snippet || (networkError ? `network_error:${networkError}` : undefined),
      });
      console.log("Pulseem response", { sendId, httpStatus, ok: effectiveOk, snippet, networkError });
      if (!effectiveOk) {
        for (const b of batch) {
          const why = parsed.reason ? `pulseem:${parsed.reason}` : `pulseem_http_${httpStatus}`;
          const detail = respText || networkError;
          failures.push({ guestId: b.id, phone: b.phoneOk, reason: `${why}${detail ? `:${String(detail).slice(0, 200)}` : ""}` });
        }
        failed += batch.length;
      } else {
        sent += batch.length;
      }

      // Log to messages table (best-effort)
      const status = effectiveOk ? `נשלח (sendId=${sendId})` : `נכשל (sendId=${sendId})`;
      const rows = batch.map((b) => ({
        event_id: eventId,
        type: "SMS",
        recipient: b.name || "מוזמן",
        phone: b.phoneOk,
        status,
        sent_date: new Date().toISOString(),
      }));
      try {
        const { error: logError } = await withRetry("insert.messages", () =>
          adminClient.from("messages").insert(rows)
        );
        if (logError) {
          // Don't fail the whole request because of logging
          console.warn("Failed to insert messages log:", logError);
        }
      } catch (logErr) {
        console.warn("Failed to insert messages log (network):", logErr);
      }
    }

    const result: SendInvitationSmsResult = {
      totalSelected,
      totalValidPhone: sendable.length,
      skippedNoPhone: noPhone,
      skippedInvalidPhone: invalidPhone,
      sent,
      failed,
      pulseemSendIds,
      pulseemResponses,
      failures,
    };

    return json({ ok: failed === 0, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, { status: 500 });
  }
});

