import "server-only";
import { connection } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export type Db = SupabaseClient<Database>;

// Anonymous, cookie-free client for the manager view. It never carries a user session, so manager pages
// show exactly the manager-safe dataset (all QAs, confirmed data, read-only) even when a QA user is signed
// in in the same browser. connection() keeps these pages rendered per request, not prerendered.
export async function createPublicClient(): Promise<Db> {
  await connection();
  return createClient<Database>(publicEnv.supabaseUrl(), publicEnv.supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
