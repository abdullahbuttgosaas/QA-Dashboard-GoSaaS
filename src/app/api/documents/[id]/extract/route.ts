import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";
import { runExtraction } from "@/services/extraction";

// Large reports can take a while for the model to process.
export const maxDuration = 300;

export async function POST(_request: Request, ctx: RouteContext<"/api/documents/[id]/extract">) {
  const viewer = await getViewer();
  if (!viewer?.isQaUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const supabase = await createClient();
  const result = await runExtraction(supabase, id);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
