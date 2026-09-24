import "server-only";
import { createPublicClient, type Db } from "@/lib/supabase/public";
import { listVisibleQas, type QaOption } from "@/services/profiles";

export type ManagerScope = {
  db: Db;
  qas: QaOption[];
  selected: QaOption | null; // null = All QAs
  params: Record<string, string>; // query params to carry between manager pages
  ownerNames: Map<string, string>;
};

// Resolves the ?qa=<slug> selection against the QAs a manager may see (public profiles only).
// Always uses the anonymous client, so the manager view is identical whether or not a QA is signed in.
export async function getManagerScope(qaParam: string | string[] | undefined): Promise<ManagerScope> {
  const db = await createPublicClient();
  const qas = await listVisibleQas(db);
  const slug = typeof qaParam === "string" ? qaParam.toLowerCase() : "";
  const selected = qas.find((q) => q.public_slug === slug) ?? null;
  return {
    db,
    qas,
    selected,
    params: selected ? { qa: selected.public_slug } : {},
    ownerNames: new Map(qas.map((q) => [q.id, q.display_name])),
  };
}
