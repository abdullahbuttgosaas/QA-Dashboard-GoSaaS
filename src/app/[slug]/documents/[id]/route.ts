import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createDocumentUrl } from "@/services/documents";

// Redirects to a short-lived signed URL. RLS on qa_documents and storage.objects decides
// visibility: anonymous viewers only reach confirmed reports on public profiles.
export async function GET(request: NextRequest, ctx: RouteContext<"/[slug]/documents/[id]">) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: doc } = await supabase.from("qa_documents").select("storage_path").eq("id", id).maybeSingle();
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const url = await createDocumentUrl(doc.storage_path, request.nextUrl.searchParams.has("download"));
  if (!url) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(url);
}
