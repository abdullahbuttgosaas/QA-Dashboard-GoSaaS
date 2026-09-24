import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";
import type { Database } from "@/types/database";

// Secret-key client that BYPASSES RLS. Use only in trusted server code for operations
// that cannot run as the user (e.g. background extraction bookkeeping). Never import in client code.
export function createAdminClient() {
  return createClient<Database>(publicEnv.supabaseUrl(), serverEnv.supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
