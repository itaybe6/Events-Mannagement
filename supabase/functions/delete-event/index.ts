// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";

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

type DeleteEventRequest = {
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
      return json(
        { error: "Missing Supabase environment variables for Edge Function" },
        { status: 500 },
      );
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

    // Validate token (same pattern as other functions)
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

    const body = (await req.json().catch(() => ({}))) as Partial<DeleteEventRequest>;
    const eventId = String(body.eventId ?? "").trim();
    if (!eventId) return json({ error: "Missing eventId" }, { status: 400 });

    const { data: profile, error: profileError } = await adminClient
      .from("users")
      .select("id, user_type")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) return json({ error: profileError.message }, { status: 500 });
    const userType = String(profile?.user_type ?? "");
    if (userType !== "admin") return json({ error: "Forbidden" }, { status: 403 });

    // Delete things that are NOT cascaded by events delete:
    // - notifications.event_id is ON DELETE SET NULL, but we want a full cleanup.
    const { error: notificationsError, count: deletedNotificationsCount } = await adminClient
      .from("notifications")
      .delete({ count: "exact" })
      .eq("event_id", eventId);
    if (notificationsError) {
      return json({ error: notificationsError.message }, { status: 500 });
    }

    // This delete cascades to: guests, guest_categories, tables, seating_maps, tasks, messages,
    // notification_settings, scheduled_sms tables, catchup queue, etc (per schema).
    const { data: deletedEvent, error: deleteError } = await adminClient
      .from("events")
      .delete()
      .eq("id", eventId)
      .select("id")
      .maybeSingle();
    if (deleteError) return json({ error: deleteError.message }, { status: 500 });
    if (!deletedEvent) return json({ error: "Event not found" }, { status: 404 });

    return json({
      ok: true,
      eventId,
      deleted: {
        notifications: deletedNotificationsCount ?? 0,
        event: 1,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, { status: 500 });
  }
});

