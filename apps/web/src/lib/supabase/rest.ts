import { createClient } from "@supabase/supabase-js";

export function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("YOUR_PROJECT")) {
    throw new Error("Supabase is not configured. Add the keys in apps/web/.env.local.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
