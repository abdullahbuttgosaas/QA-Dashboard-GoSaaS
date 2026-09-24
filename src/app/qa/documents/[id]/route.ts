import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createDocumentUrl } from "@/services/documents";

// Signed link as the signed-in QA user: RLS lets owners open their own drafts and confirmed reports.
export async function GET(request: NextRequest, ctx: RouteContext<"/qa/documents/[id]">) {
  const { id } = await ctx.params;
  const url = await createDocumentUrl(await createClient(), id, request.nextUrl.searchParams.has("download"));
  return url ? NextResponse.redirect(url) : new NextResponse("Not found", { status: 404 });
}
