// End-to-end permissions audit against the LOCAL Supabase stack and local dev server.
// Usage: npm run audit:local   (resets the local DB first; requires `npm run db:start` and `npm run dev`)
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

  for (const p of ["/qa", "/qa/tickets", "/qa/upload", "/qa/settings", "/qa/tickets/new"]) {
    const r = await get(p);
    check("anon-http", `QA page requires sign-in: ${p}`, r.status === 307 && (r.headers.get("location") ?? "").startsWith("/login?next="));
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
  check("auth", "no confirmation/magic-link landing route", (await get("/auth/callback?code=x")).status === 404);
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
  check("auth", "sign-up signs in immediately (no confirmation email)", !!su.data.session && !!su.data.user?.email_confirmed_at);
  const again = await a.auth.signInWithPassword({ email: "new.member@gosaas.ai", password: pw });
  check("auth", "new user can sign in with password", !again.error, again.error?.code);
  const weak = await a.auth.signUp({ email: "weak.pw@gosaas.ai", password: "Seven77" });
  check("auth", "7-character password rejected by Supabase (minimum 8)", weak.error?.code === "weak_password", weak.error?.code);
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
  const uploadPage = await get("/qa/upload", cookie);
  check("qa-http", "owner sees upload page", uploadPage.status === 200 && (await uploadPage.text()).includes("Upload QA report"));
  check("qa-http", "owner sees review page for draft", (await get(`/qa/review/${docId}`, cookie)).status === 200);
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
  check("storage", "manager document link for draft is 404", (await get(`/manager/documents/${docId}`)).status === 404);
  check("storage", "owner can open own draft via QA link", (await get(`/qa/documents/${docId}`, await cookieHeader(qaSession))).status === 307);
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
  const docRoute = await get(`/manager/documents/${docId}`);
  check("storage", "manager document link for confirmed report redirects", docRoute.status === 307 || docRoute.status === 302);

  // Private profile: nothing visible anonymously.
  const qa2Id = created.data?.user?.id;
  await qa2.from("profiles").update({ is_public: false }).eq("id", qa2Id);
  await qa2.from("qa_records").insert({ owner_id: qa2Id, ticket_number: "PRIV-1" });
  check("privacy", "private profile hidden from anon", ((await a.from("profiles").select("id").eq("id", qa2Id)).data ?? []).length === 0);
  check("privacy", "private tickets hidden from anon", ((await a.from("qa_records").select("id").eq("owner_id", qa2Id)).data ?? []).length === 0);
  check("privacy", "private tickets hidden from other QA users", ((await qa.from("qa_records").select("id").eq("owner_id", qa2Id)).data ?? []).length === 0);
}

// ---------------------------------------------------------------------------
// 5. Manager vs QA experiences
// ---------------------------------------------------------------------------
{
  const MUTATION_UI = /Upload QA report|New ticket|>Edit<|>Delete<|Sign out|>Settings<|Confirm and save|Create ticket|Save changes/;
  const metric = (html, name) => {
    const m = new RegExp(`data-metric="${name}"[^>]*>([^<]*)<`).exec(html);
    return m ? m[1].trim() : null;
  };

  // A second public QA with its own data, to prove the selector filters correctly.
  const { client: qa3 } = await sessionFor("tester.two@gosaas.ai");
  const { data: two } = await qa3
    .from("qa_records")
    .insert({
      owner_id: (await qa3.auth.getUser()).data.user.id,
      ticket_number: "TWO-1",
      title: "Second QA ticket",
      qa_status: "qa_completed",
      qa_completed_on: new Date().toISOString().slice(0, 10),
      data: { schema_version: 1, test_cases: [{ status: "pass" }, { status: "pass" }, { status: "fail" }], bugs: [{ title: "B", severity: "critical" }] },
    })
    .select("id")
    .single();
  const abdullahTicket = (await anon().from("qa_records").select("id").eq("ticket_number", "CHG0045893").single()).data.id;
  const cookie = await cookieHeader(qaSession);

  for (const [label, c] of [["anon", undefined], ["signed-in QA", cookie]]) {
    for (const p of ["/manager", "/manager/tickets", `/manager/tickets/${abdullahTicket}`, "/manager?qa=tester", "/manager/tickets?qa=abdullah"]) {
      const r = await get(p, c);
      const html = await r.text();
      check("manager", `${p} loads for ${label}`, r.status === 200, String(r.status));
      check("manager", `${p} has no mutation controls for ${label}`, !MUTATION_UI.test(html));
    }
  }

  const all = await (await get("/manager/tickets")).text();
  check("manager", "selector offers All QAs and each public QA", /<option value=""[^>]*>All QAs<\/option>/.test(all) && /value="abdullah"/.test(all) && /value="tester"/.test(all));
  check("manager", "selector hides private QAs", !/value="second"/.test(all));
  check("manager", "All QAs lists tickets from every public QA", all.includes("CHG0045893") && all.includes("TWO-1"));
  check("manager", "All QAs never shows private QA tickets", !all.includes("PRIV-1"));
  const onlyTester = await (await get("/manager/tickets?qa=tester")).text();
  check("manager", "individual QA filter lists only that QA's tickets", onlyTester.includes("TWO-1") && !onlyTester.includes("CHG0045893"));
  check("manager", "ticket links keep the QA filter", onlyTester.includes(`/manager/tickets/${two.id}?qa=tester`));

  const a = anon();
  const expected = async (owner) => (await a.rpc("qa_metrics_by_period", { p_owner: owner, p_count: 26 })).data.at(-1).test_cases_executed;
  const testerId = (await a.from("profiles").select("id").eq("public_slug", "tester").single()).data.id;
  const dashAll = await (await get("/manager")).text();
  const dashTester = await (await get("/manager?qa=tester")).text();
  const dashAbdullah = await (await get("/manager?qa=abdullah")).text();
  check("manager", "individual QA metrics match that QA only", metric(dashTester, "test_cases_executed") === String(await expected(testerId)), metric(dashTester, "test_cases_executed"));
  check("manager", "individual QA bug count filtered", metric(dashTester, "bugs_total") === "1", metric(dashTester, "bugs_total"));
  check("manager", "All QAs metrics are the team total", metric(dashAll, "test_cases_executed") === String(await expected(null)), metric(dashAll, "test_cases_executed"));
  check("manager", "different QA selections give different metrics", metric(dashTester, "tickets_completed") !== metric(dashAbdullah, "tickets_completed") || metric(dashTester, "test_cases_executed") !== metric(dashAbdullah, "test_cases_executed"));
  const dashAllSignedIn = await (await get("/manager", cookie)).text();
  check("manager", "signing in does not change the manager view", metric(dashAllSignedIn, "test_cases_executed") === metric(dashAll, "test_cases_executed"));
  const detail = await (await get(`/manager/tickets/${abdullahTicket}`, cookie)).text();
  check("manager", "manager ticket detail is read-only even when signed in", detail.includes("CHG0045893") && !MUTATION_UI.test(detail));
  const privId = (await admin.from("qa_records").select("id").eq("ticket_number", "PRIV-1").single()).data.id;
  check("manager", "private QA ticket is not viewable by managers", (await get(`/manager/tickets/${privId}`)).status === 404);

  // QA workspace
  const loginRedirect = await get("/login", cookie);
  check("qa", "signed-in QA visiting /login is sent to /qa", loginRedirect.status === 307 && loginRedirect.headers.get("location") === "/qa");
  const home = await get("/", cookie);
  check("qa", "home sends signed-in QA to /qa", home.status === 307 && home.headers.get("location") === "/qa");
  check("qa", "home sends anonymous visitors to /manager", (await get("/")).headers.get("location") === "/manager");
  const qaDash = await (await get("/qa", cookie)).text();
  check("qa", "/qa has QA controls", /Upload QA report/.test(qaDash) && /New ticket/.test(qaDash) && /Sign out/.test(qaDash));
  const qaList = await (await get("/qa/tickets", cookie)).text();
  check("qa", "/qa/tickets has QA controls", /New ticket/.test(qaList) && /Upload QA report/.test(qaList));
  check("qa", "/qa/tickets shows only own tickets", qaList.includes("CHG0045893") && !qaList.includes("TWO-1"));
  const qaDetail = await (await get(`/qa/tickets/${abdullahTicket}`, cookie)).text();
  check("qa", "/qa/tickets/[id] has Edit and Delete", />Edit</.test(qaDetail) && />Delete</.test(qaDetail));
  check("qa", "QA cannot open another QA's ticket in the workspace", (await get(`/qa/tickets/${two.id}`, cookie)).status === 404);
  check("qa", "/qa/tickets/[id]/edit loads for owner", (await get(`/qa/tickets/${abdullahTicket}/edit`, cookie)).status === 200);

  // Legacy public URLs
  const legacy = [["/abdullah", "/manager"], ["/abdullah/tickets", "/manager/tickets"], ["/abdullah/tickets/CHG0045893", `/manager/tickets/${abdullahTicket}`]];
  for (const [from, to] of legacy) {
    const r = await get(from);
    check("legacy", `${from} redirects to ${to}`, [307, 308].includes(r.status) && r.headers.get("location") === to, `${r.status} ${r.headers.get("location")}`);
  }
  check("legacy", "unknown slug is 404, not a redirect", (await get("/not-a-real-qa")).status === 404);
}

// ---------------------------------------------------------------------------
const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  [${r.area}] ${r.name}${!r.pass && r.detail ? ` — ${r.detail}` : ""}`);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
