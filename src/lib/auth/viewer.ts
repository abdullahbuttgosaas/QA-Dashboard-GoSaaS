import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { isAllowedEmail } from "@/lib/auth/domain";

export type Viewer = {
  userId: string;
  email: string;
  isQaUser: boolean;
};

// The signed-in user for this request, or null for anonymous (manager) visitors.
// getClaims() verifies the JWT; never trust getSession() on the server.
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const email = typeof claims.email === "string" ? claims.email : "";
  return {
    userId: claims.sub,
    email,
    isQaUser: isAllowedEmail(email, serverEnv.allowedEmailDomain()),
  };
});
