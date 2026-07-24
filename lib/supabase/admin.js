import { createClient } from "@supabase/supabase-js";

// Service-role client — NEVER import this in client components.
// Only used inside server-only Route Handlers, and only after the
// caller has been verified as the admin.
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
