import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server client that reads the caller's session from cookies — used in
// Route Handlers to check "is this request really the admin?" before
// doing anything privileged.
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // called from a Server Component render — safe to ignore
          }
        },
      },
    }
  );
}
