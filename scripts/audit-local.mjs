// End-to-end permissions audit against the LOCAL Supabase stack and local dev server.
// Usage: npm run audit:local   (requires `npm run db:start` and `npm run dev`)
// Refuses to run against anything that is not localhost. Mutates only the local database.

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const localEnv = Object.fromEntries(
  execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);
const URL_ = localEnv.API_URL;
const PUBLISHABLE = localEnv.PUBLISHABLE_KEY;
const SECRET = localEnv.SECRET_KEY;
const APP = process.env.APP_URL ?? "http://localhost:3000";
for (const u of [URL_, APP]) {
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(u ?? "")) throw new Error(`Refusing to audit non-local target: ${u}`);
}

const BUCKET = "qa-reports";
const OWNER_ID = "00000000-0000-4000-8000-000000000001"; // seeded abdullah.butt@gosaas.ai
const results = [];
const check = (area, name, pass, detail = "") => results.push({ area, name, pass: !!pass, detail });
const denied = (r) => !!r.error || (Array.isArray(r.data) && r.data.length === 0);

const anon = () => createClient(URL_, PUBLISHABLE, { auth: { persistSession: false } });
const admin = createClient(URL_, SECRET, { auth: { persistSession: false } });

// Signs in exactly like the login page (email + password). Local test passwords are random per run.
const passwords = new Map();
async function sessionFor(email) {
  if (!passwords.has(email)) {
    const password = `Audit-${crypto.randomUUID()}`;
    const { data: list } = await admin.auth.admin.listUsers();
    const user = list.users.find((u) => u.email === email);
    const res = user
      ? await admin.auth.admin.updateUserById(user.id, { password })
      : await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (res.error) throw res.error;
    passwords.set(email, password);
  }
  const client = anon();
  const { data, error } = await client.auth.signInWithPassword({ email, password: passwords.get(email) });
  if (error) throw error;
  return { client, session: data.session };
}

// Build the exact auth cookies @supabase/ssr would set, so HTTP requests act as that user.
async function cookieHeader(session) {
  const jar = new Map();
  const ssr = createServerClient(URL_, PUBLISHABLE, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (cs) => cs.forEach((c) => jar.set(c.name, c.value)) },
  });
  await ssr.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

const get = (path, cookie) => fetch(APP + path, { redirect: "manual", headers: cookie ? { cookie } : {} });

// ---------------------------------------------------------------------------
// 1. Public manager view (anonymous) is read-only
// ---------------------------------------------------------------------------
{
  const a = anon();
  const prof = await a.from("profiles").select("id, public_slug").eq("public_slug", "abdullah");
  check("anon", "can read public profile", prof.data?.length === 1);
  check("anon", "cannot read profile emails", !!(await a.from("profiles").select("email")).error);
  const tickets = await a.from("qa_records").select("ticket_number");
  check("anon", "can read public tickets", (tickets.data?.length ?? 0) >= 3, `${tickets.data?.length} tickets`);
  check("anon", "cannot insert tickets", !!(await a.from("qa_records").insert({ owner_id: OWNER_ID, ticket_number: "ANON-1" })).error);
  check("anon", "cannot update tickets", denied(await a.from("qa_records").update({ title: "x" }).eq("owner_id", OWNER_ID).select()));
  check("anon", "cannot delete tickets", denied(await a.from("qa_records").delete().eq("owner_id", OWNER_ID).select()));
  check("anon", "cannot edit profiles", denied(await a.from("profiles").update({ display_name: "x" }).eq("id", OWNER_ID).select()));
  check("anon", "cannot insert documents", !!(await a.from("qa_documents").insert({ owner_id: OWNER_ID, storage_path: `${OWNER_ID}/x/y.pdf`, file_name: "y", mime_type: "application/pdf", size_bytes: 1 })).error);
  check("anon", "cannot call confirm_extraction", !!(await a.rpc("confirm_extraction", { p_document_id: OWNER_ID, p_record: {} })).error);
  check("anon", "cannot call signup hook", !!(await a.rpc("hook_before_user_created", { event: {} })).error);
  check("anon", "cannot upload files", !!(await a.storage.from(BUCKET).upload(`${OWNER_ID}/anon/x.txt`, new Blob(["x"], { type: "text/plain" }), { contentType: "text/plain" })).error);

  const page = await get("/abdullah");
  const html = await page.text();
  check("anon-http", "dashboard renders", page.status === 200);
  check("anon-http", "no edit controls on dashboard", !/Upload QA report|New ticket|Sign out/.test(html));
  const ticketHtml = await (await get("/abdullah/tickets/CHG0045893")).text();
  check("anon-http", "no edit controls on ticket", !/>Edit<|>Delete</.test(ticketHtml));
  for (const p of ["/abdullah/upload", "/abdullah/settings", "/abdullah/tickets/new", "/abdullah/tickets/CHG0045893/edit"]) {
    check("anon-http", `owner page hidden: ${p}`, (await get(p)).status === 404);
  }
  const ex = await fetch(`${APP}/api/documents/${OWNER_ID}/extract`, { method: "POST" });
  check("anon-http", "extraction API rejects anonymous", ex.status === 401);
}

// ---------------------------------------------------------------------------
// 2. Non-@gosaas.ai users are blocked
// ---------------------------------------------------------------------------
{
  const a = anon();
  const otp = await a.auth.signInWithOtp({ email: "outsider@gmail.com" });
  check("domain", "Supabase email endpoint rejects other domain (unused by app)", !!otp.error, otp.error?.message);
  const su = await a.auth.signUp({ email: "outsider@gmail.com", password: "A-long-password-123!" });
  check("domain", "password signup rejected for other domain", !!su.error, su.error?.message);
  const tricky = await a.auth.signInWithOtp({ email: "outsider@gosaas.ai.evil.com" });
  check("domain", "look-alike domain rejected by email endpoint", !!tricky.error, tricky.error?.message);
  const adm = await admin.auth.admin.createUser({ email: "outsider2@gmail.com", email_confirm: true });
  check("domain", "even admin-created outsider rejected (DB trigger)", !!adm.error, adm.error?.message);
  const form = await fetch(`${APP}/login`, { method: "GET" });
  check("domain", "login page available", form.status === 200);
  const lookalike = await a.auth.signUp({ email: "outsider@gosaas.ai.evil.com", password: "A-long-password-123!" });
  check("domain", "look-alike domain signup rejected", !!lookalike.error, lookalike.error?.message);
  const cb = await get("/auth/callback");
  check("auth", "confirmation landing sends user to sign in", cb.status === 307 && (cb.headers.get("location") ?? "").includes("/login?confirmed=1"));
}

// ---------------------------------------------------------------------------
// 2b. Email + password authentication
// ---------------------------------------------------------------------------
{
  const a = anon();
  await sessionFor("abdullah.butt@gosaas.ai"); // sets a known password on the seeded user
  const wrong = await a.auth.signInWithPassword({ email: "abdullah.butt@gosaas.ai", password: "definitely-wrong-password" });
  check("auth", "wrong password rejected", wrong.error?.code === "invalid_credentials", wrong.error?.code);
  const unknown = await a.auth.signInWithPassword({ email: "nobody@gosaas.ai", password: "whatever-123456" });
  check("auth", "unknown user gets the same generic error", unknown.error?.code === "invalid_credentials", unknown.error?.code);
  const pw = `Audit-${crypto.randomUUID()}`;
  const su = await a.auth.signUp({ email: "new.member@gosaas.ai", password: pw });
  check("auth", "@gosaas.ai self sign-up creates the account", !su.error && !!su.data.user, su.error?.message);
  const newProfile = await admin.from("profiles").select("public_slug").eq("id", su.data.user?.id ?? "");
  check("auth", "profile created for new user", newProfile.data?.[0]?.public_slug === "new", JSON.stringify(newProfile.data));
  const early = await a.auth.signInWithPassword({ email: "new.member@gosaas.ai", password: pw });
  check("auth", "unconfirmed account cannot sign in (confirmation on)", early.error?.code === "email_not_confirmed", early.error?.code);
  check("auth", "no session issued before confirmation", !su.data.session);
  const weak = await a.auth.signUp({ email: "weak.pw@gosaas.ai", password: "123" });
  check("auth", "too-short password rejected by Supabase", !!weak.error, weak.error?.code);
}

// ---------------------------------------------------------------------------
// 3. Authenticated QA user can perform intended writes (own data only)
// ---------------------------------------------------------------------------
const { client: qa, session: qaSession } = await sessionFor("abdullah.butt@gosaas.ai");
check("auth", "correct password signs the QA user in", !!qaSession?.access_token);
check("auth", "session belongs to the right user", qaSession?.user?.id === OWNER_ID && qaSession?.user?.email === "abdullah.butt@gosaas.ai");
const docId = crypto.randomUUID();
const draftPath = `${OWNER_ID}/${docId}/audit-report.txt`;
{
  const ins = await qa.from("qa_records").insert({ owner_id: OWNER_ID, ticket_number: "AUDIT-1", title: "Audit", data: { schema_version: 1 } }).select("id");
  check("qa", "can create own ticket", !ins.error && ins.data?.length === 1, ins.error?.message);
  const upd = await qa.from("qa_records").update({ title: "Audit updated" }).eq("ticket_number", "AUDIT-1").select("title");
  check("qa", "can edit own ticket", upd.data?.[0]?.title === "Audit updated", upd.error?.message);
  const del = await qa.from("qa_records").delete().eq("ticket_number", "AUDIT-1").select("id");
  check("qa", "can delete own ticket", del.data?.length === 1, del.error?.message);
  check("qa", "cannot create ticket for another owner", !!(await qa.from("qa_records").insert({ owner_id: crypto.randomUUID(), ticket_number: "X" })).error);
  const prof = await qa.from("profiles").update({ display_name: "Abdullah Butt" }).eq("id", OWNER_ID).select("id");
  check("qa", "can edit own profile", prof.data?.length === 1, prof.error?.message);
  check("qa", "cannot change own role", !!(await qa.from("profiles").update({ role: "admin" }).eq("id", OWNER_ID)).error);

  const up = await qa.storage.from(BUCKET).upload(draftPath, new Blob(["TC-1 pass"], { type: "text/plain" }), { contentType: "text/plain" });
  check("qa", "can upload report to own folder", !up.error, up.error?.message);
  const other = await qa.storage.from(BUCKET).upload(`${crypto.randomUUID()}/x/y.txt`, new Blob(["x"], { type: "text/plain" }), { contentType: "text/plain" });
  check("qa", "cannot upload into another user's folder", !!other.error);
  const bad = await qa.storage.from(BUCKET).upload(`${OWNER_ID}/${docId}/evil.html`, new Blob(["<script>"], { type: "text/html" }), { contentType: "text/html" });
  check("qa", "disallowed file type rejected by bucket", !!bad.error);
  const reg = await qa.from("qa_documents").insert({ id: docId, owner_id: OWNER_ID, storage_path: draftPath, file_name: "audit-report.txt", mime_type: "text/plain", size_bytes: 9 });
  check("qa", "can register own upload", !reg.error, reg.error?.message);

  const cookie = await cookieHeader(qaSession);
  const uploadPage = await get("/abdullah/upload", cookie);
  check("qa-http", "owner sees upload page", uploadPage.status === 200 && (await uploadPage.text()).includes("Upload QA report"));
  const tHtml = await (await get("/abdullah/tickets/CHG0045893", cookie)).text();
  check("qa-http", "owner sees Edit/Delete on ticket", />Edit</.test(tHtml) && />Delete</.test(tHtml));
  check("qa-http", "owner sees review page for draft", (await get(`/abdullah/review/${docId}`, cookie)).status === 200);
}

// ---------------------------------------------------------------------------
// 4. Private qa-reports storage rules
// ---------------------------------------------------------------------------
{
  const a = anon();
  const pub = await fetch(`${URL_}/storage/v1/object/public/${BUCKET}/${draftPath}`);
  check("storage", "bucket has no public URLs", pub.status >= 400);
  check("storage", "anon cannot sign draft file", !!(await a.storage.from(BUCKET).createSignedUrl(draftPath, 60)).error);
  check("storage", "anon cannot list files", ((await a.storage.from(BUCKET).list(OWNER_ID)).data ?? []).length === 0);
  check("storage", "anon document link for draft is 404", (await get(`/abdullah/documents/${docId}`)).status === 404);
  const own = await qa.storage.from(BUCKET).createSignedUrl(draftPath, 60);
  check("storage", "owner can open own draft", !own.error && (await fetch(own.data.signedUrl)).status === 200);

  // Second QA user from the allowed domain must not see or touch the first user's drafts.
  const created = await admin.auth.admin.createUser({ email: "second.qa@gosaas.ai", email_confirm: true });
  check("storage", "second @gosaas.ai user can be created", !created.error, created.error?.message);
  const { client: qa2 } = await sessionFor("second.qa@gosaas.ai");
  check("storage", "other QA user cannot sign draft file", !!(await qa2.storage.from(BUCKET).createSignedUrl(draftPath, 60)).error);
  check("storage", "other QA user cannot see draft document row", ((await qa2.from("qa_documents").select("id").eq("id", docId)).data ?? []).length === 0);
  const rm = await qa2.storage.from(BUCKET).remove([draftPath]);
  check("storage", "other QA user cannot delete the file", (rm.data ?? []).length === 0);
  check("storage", "other QA user cannot edit first user's tickets", denied(await qa2.from("qa_records").update({ title: "x" }).eq("owner_id", OWNER_ID).select()));

  // Extraction moves the document to review (as the extraction route does); confirming then publishes it read-only.
  check("storage", "confirm is blocked before extraction/review", !!(await qa.rpc("confirm_extraction", { p_document_id: docId, p_record: { ticket_number: "AUDIT-0" } })).error);
  await qa.from("qa_documents").update({ extraction_status: "ready_for_review" }).eq("id", docId);
  const conf = await qa.rpc("confirm_extraction", {
    p_document_id: docId,
    p_record: { ticket_number: "AUDIT-2", title: "Audit confirm", qa_status: "qa_completed", qa_completed_on: "2026-09-24", data: { schema_version: 1, test_cases: [{ status: "pass" }] } },
  });
  check("storage", "owner can confirm extraction", !conf.error, conf.error?.message);
  const signed = await a.storage.from(BUCKET).createSignedUrl(draftPath, 60);
  check("storage", "anon can open confirmed report (read-only)", !signed.error && (await fetch(signed.data.signedUrl)).status === 200);
  check("storage", "anon still cannot delete confirmed report", ((await a.storage.from(BUCKET).remove([draftPath])).data ?? []).length === 0);
  const docRoute = await get(`/abdullah/documents/${docId}`);
  check("storage", "anon document link for confirmed report redirects", docRoute.status === 307 || docRoute.status === 302);

  // Private profile: nothing visible anonymously.
  const qa2Id = created.data?.user?.id;
  await qa2.from("profiles").update({ is_public: false }).eq("id", qa2Id);
  await qa2.from("qa_records").insert({ owner_id: qa2Id, ticket_number: "PRIV-1" });
  check("privacy", "private profile hidden from anon", ((await a.from("profiles").select("id").eq("id", qa2Id)).data ?? []).length === 0);
  check("privacy", "private tickets hidden from anon", ((await a.from("qa_records").select("id").eq("owner_id", qa2Id)).data ?? []).length === 0);
  check("privacy", "private tickets hidden from other QA users", ((await qa.from("qa_records").select("id").eq("owner_id", qa2Id)).data ?? []).length === 0);
}

// ---------------------------------------------------------------------------
const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  [${r.area}] ${r.name}${!r.pass && r.detail ? ` — ${r.detail}` : ""}`);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
