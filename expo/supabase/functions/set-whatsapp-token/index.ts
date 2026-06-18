// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";
import { encryptToken, getTokenEncSecret } from "../_shared/whatsapp.ts";

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

    // Admin only.
    const { data: profile } = await adminClient.from("users").select("id, user_type").eq("id", userId).maybeSingle();
    if (String((profile as any)?.user_type ?? "") !== "admin") {
      return json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const token = String(body?.token ?? "").trim();

    // Empty token => clear the stored token.
    if (!token) {
      const { error } = await adminClient
        .from("whatsapp_settings")
        .update({
          access_token_ciphertext: null,
          access_token_iv: null,
          access_token_hint: null,
          access_token_updated_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", true);
      if (error) return json({ error: error.message }, { status: 500 });
      return json({ ok: true, cleared: true });
    }

    const secret = getTokenEncSecret();
    if (!secret) {
      return json({ error: "Missing encryption key (WHATSAPP_TOKEN_ENC_KEY)" }, { status: 500 });
    }

    const { ciphertext, iv } = await encryptToken(token, secret);
    const hint = token.length <= 4 ? token : `…${token.slice(-4)}`;

    const { error } = await adminClient
      .from("whatsapp_settings")
      .update({
        access_token_ciphertext: ciphertext,
        access_token_iv: iv,
        access_token_hint: hint,
        access_token_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    if (error) return json({ error: error.message }, { status: 500 });

    return json({ ok: true, hint });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
});
