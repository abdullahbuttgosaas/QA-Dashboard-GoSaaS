import { NextResponse, type NextRequest } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { createDocumentUrl } from "@/services/documents";

// Anonymous signed link: storage policies only allow confirmed reports (drafts are never manager-visible).
export async function GET(request: NextRequest, ctx: RouteContext<"/manager/documents/[id]">) {
  const { id } = await ctx.params;
  const url = await createDocumentUrl(await createPublicClient(), id, request.nextUrl.searchParams.has("download"));
  return url ? NextResponse.redirect(url) : new NextResponse("Not found", { status: 404 });
}
