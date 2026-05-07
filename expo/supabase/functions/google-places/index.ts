// @ts-nocheck
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

function extractCity(addressComponents: any[] | undefined, fallbackText = "") {
  const parts = Array.isArray(addressComponents) ? addressComponents : [];
  const direct =
    parts.find((part) => Array.isArray(part?.types) && part.types.includes("locality"))?.long_name ||
    parts.find((part) => Array.isArray(part?.types) && part.types.includes("administrative_area_level_2"))?.long_name ||
    parts.find((part) => Array.isArray(part?.types) && part.types.includes("administrative_area_level_1"))?.long_name ||
    "";
  if (direct) return String(direct).trim();

  const fallback = String(fallbackText || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return fallback.at(-2) || fallback.at(-1) || "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  try {
    const supabaseUrl = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
    const supabaseAnonKey = String(Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
    const supabaseServiceKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
    const googleMapsApiKey = String(
      Deno.env.get("GOOGLE_MAPS_API_KEY") ?? Deno.env.get("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY") ?? ""
    ).trim();

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return json({ error: "Missing Supabase environment variables" }, { status: 500 });
    }
    if (!googleMapsApiKey) {
      return json({ error: "Missing GOOGLE_MAPS_API_KEY secret" }, { status: 500 });
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

    let authOk = false;
    const userRes = await userClient.auth.getUser();
    if (userRes.data?.user?.id) {
      authOk = true;
    } else {
      const adminUserRes = await adminClient.auth.getUser(bearerToken);
      authOk = Boolean(adminUserRes.data?.user?.id);
    }
    if (!authOk) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "").trim();

    if (action === "autocomplete") {
      const input = String(body?.input ?? "").trim();
      if (input.length < 2) return json({ predictions: [] });

      const url =
        "https://maps.googleapis.com/maps/api/place/autocomplete/json?" +
        new URLSearchParams({
          input,
          language: "he",
          components: "country:il",
          key: googleMapsApiKey,
        }).toString();

      const resp = await fetch(url);
      const data = await resp.json();
      if (!resp.ok) {
        return json({ error: "Google autocomplete request failed", details: data }, { status: 502 });
      }

      const predictions = Array.isArray(data?.predictions)
        ? data.predictions.map((prediction: any) => ({
            placeId: String(prediction?.place_id ?? ""),
            title: String(prediction?.structured_formatting?.main_text ?? prediction?.description ?? "").trim(),
            subtitle: String(prediction?.structured_formatting?.secondary_text ?? "").trim(),
            description: String(prediction?.description ?? "").trim(),
          }))
        : [];

      return json({ predictions });
    }

    if (action === "details") {
      const placeId = String(body?.placeId ?? "").trim();
      if (!placeId) return json({ error: "Missing placeId" }, { status: 400 });

      const url =
        "https://maps.googleapis.com/maps/api/place/details/json?" +
        new URLSearchParams({
          place_id: placeId,
          language: "he",
          fields: "place_id,name,formatted_address,address_component",
          key: googleMapsApiKey,
        }).toString();

      const resp = await fetch(url);
      const data = await resp.json();
      if (!resp.ok) {
        return json({ error: "Google place details request failed", details: data }, { status: 502 });
      }

      const result = data?.result ?? null;
      if (!result) return json({ error: "Place details not found" }, { status: 404 });

      return json({
        place: {
          placeId: String(result?.place_id ?? placeId),
          name: String(result?.name ?? "").trim(),
          formattedAddress: String(result?.formatted_address ?? "").trim(),
          city: extractCity(result?.address_components, result?.formatted_address),
        },
      });
    }

    return json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("google-places error:", error);
    return json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
});
