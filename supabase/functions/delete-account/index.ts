// Edge Function: delete-account
// Permanently deletes the signed-in user and, through the tables' "on delete cascade",
// every row they have in the cloud. The app calls this from Settings > Delete my cloud data.
//
// Why a function: deleting a user needs the service-role key, which must never be in the
// app's code. Edge Functions get it from the project's secrets (SUPABASE_SERVICE_ROLE_KEY).
//
// Deploy: Dashboard > Edge Functions > Deploy a new function > "Via Editor", name it exactly
// `delete-account`, paste this file. Turn OFF "Verify JWT" for it: this code checks the
// sign-in itself (below), which also works with the newer signing keys.
import { createClient } from "npm:@supabase/supabase-js@2";

// Pages this function answers to (the browser blocks other sites from calling it). If you use a
// custom domain for the app, add it here.
const allowedOrigin = (origin: string) =>
  origin === "https://will-clutter.github.io" || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  const cors = {
    "Access-Control-Allow-Origin": allowedOrigin(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);

  // Who is asking? Only ever delete the user whose sign-in token came with the request.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return reply({ error: "not_signed_in" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return reply({ error: "not_signed_in" }, 401);

  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleteError) {
    console.error("delete-account failed:", deleteError.message);
    return reply({ error: "delete_failed" }, 500);
  }
  return reply({ deleted: true });
});
