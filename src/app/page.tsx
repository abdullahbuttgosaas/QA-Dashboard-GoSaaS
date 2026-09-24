import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";

// Signed-in QA users land in their workspace; everyone else sees the read-only manager dashboard.
export default async function Home() {
  redirect((await getViewer())?.isQaUser ? "/qa" : "/manager");
}
