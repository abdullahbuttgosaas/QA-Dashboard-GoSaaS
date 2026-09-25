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

// Same "today" as the app (UTC date). Fixtures use the latest weekday so weekend runs stay meaningful.
const TODAY = new Date().toISOString().slice(0, 10);
const LAST_WEEKDAY = (() => {
  const d = new Date(`${TODAY}T00:00:00Z`);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
})();

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
  // The legacy is_public flag must not let a QA hide from managers (set via admin; QAs can no longer change it).
  const flip = await qa2.from("profiles").update({ is_public: false }).eq("id", qa2Id).select("id");
  check("visibility", "QA can no longer change is_public", !!flip.error || (flip.data ?? []).length === 0, flip.error?.code);
  await admin.from("profiles").update({ is_public: false }).eq("id", qa2Id);
  await qa2.from("qa_records").insert({
    owner_id: qa2Id,
    ticket_number: "HIDDEN-1",
    qa_status: "qa_completed",
    qa_completed_on: LAST_WEEKDAY,
    data: { schema_version: 1, test_cases: [{ status: "fail" }] },
  });
  check("visibility", "is_public=false QA is still visible to the manager", ((await a.from("profiles").select("id").eq("id", qa2Id)).data ?? []).length === 1);
  check("visibility", "is_public=false QA's tickets are visible to the manager", ((await a.from("qa_records").select("id").eq("owner_id", qa2Id)).data ?? []).length === 1);
  check("visibility", "other QA users still cannot read that QA's tickets", ((await qa.from("qa_records").select("id").eq("owner_id", qa2Id)).data ?? []).length === 0);
  check("visibility", "other QA users cannot read that QA's profile", ((await qa.from("profiles").select("id").eq("id", qa2Id)).data ?? []).length === 0);
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

  // A third QA with its own data, to prove the selector filters correctly.
  const { client: qa3 } = await sessionFor("tester.two@gosaas.ai");
  const { data: two } = await qa3
    .from("qa_records")
    .insert({
      owner_id: (await qa3.auth.getUser()).data.user.id,
      ticket_number: "TWO-1",
      title: "Second QA ticket",
      qa_status: "qa_completed",
      qa_completed_on: LAST_WEEKDAY,
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
  check("manager", "selector offers All QAs and every QA", /<option value=""[^>]*>All QAs<\/option>/.test(all) && /value="abdullah"/.test(all) && /value="tester"/.test(all));
  check("manager", "selector lists every QA, including is_public=false", /value="second"/.test(all));
  check("manager", "All QAs lists tickets from every QA", all.includes("CHG0045893") && all.includes("TWO-1"));
  check("manager", "All QAs includes tickets of an is_public=false QA", all.includes("HIDDEN-1"));
  const onlyTester = await (await get("/manager/tickets?qa=tester")).text();
  check("manager", "individual QA filter lists only that QA's tickets", onlyTester.includes("TWO-1") && !onlyTester.includes("CHG0045893"));
  check("manager", "ticket links keep the QA filter", onlyTester.includes(`/manager/tickets/${two.id}?qa=tester`));

  const a = anon();
  // Weekly model: current period = last N Monday-Friday weeks (N = QA's setting, 2 for All QAs).
  const weekly = async (owner, weeks = 2) => (await a.rpc("qa_metrics_by_week", { p_owner: owner, p_count: weeks * 2, p_today: TODAY })).data;
  const expected = async (owner, weeks = 2) => (await weekly(owner, weeks)).slice(-weeks).reduce((n, w) => n + w.test_cases_executed, 0);
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
  const hiddenId = (await admin.from("qa_records").select("id").eq("ticket_number", "HIDDEN-1").single()).data.id;
  const hiddenPage = await get(`/manager/tickets/${hiddenId}`);
  check("manager", "manager can open a ticket of an is_public=false QA (read-only)", hiddenPage.status === 200 && !MUTATION_UI.test(await hiddenPage.text()));

  // Every QA can be selected individually, and All QAs is the sum across all of them.
  const everyone = (await admin.from("profiles").select("id, public_slug, reporting_period_weeks")).data;
  const allTickets = (await admin.from("qa_records").select("owner_id, ticket_number")).data;
  let sum = 0;
  for (const q of everyone) {
    const page = await (await get(`/manager/tickets?qa=${q.public_slug}`)).text();
    const own = allTickets.filter((t) => t.owner_id === q.id).map((t) => t.ticket_number);
    const others = allTickets.filter((t) => t.owner_id !== q.id).map((t) => t.ticket_number);
    check("manager", `filter to ${q.public_slug} shows exactly that QA's tickets`, own.every((n) => page.includes(n)) && !others.some((n) => page.includes(`>${n}<`)));
    const dash = await (await get(`/manager?qa=${q.public_slug}`)).text();
    const exp = await expected(q.id, q.reporting_period_weeks);
    sum += await expected(q.id, 2);
    check("manager", `filter to ${q.public_slug} shows that QA's metrics`, metric(dash, "test_cases_executed") === String(exp), `${metric(dash, "test_cases_executed")} vs ${exp}`);
  }
  check("manager", "All QAs metrics equal the sum over every QA", metric(dashAll, "test_cases_executed") === String(sum), `${metric(dashAll, "test_cases_executed")} vs ${sum}`);

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

  // ---------------------------------------------------------------------------
  // 6. Calendar-week reporting (Monday-Friday)
  // ---------------------------------------------------------------------------
  const periodOf = (html) => /data-period="([^"]+)"/.exec(html)?.[1];
  const teamWeeks = await weekly(null, 2);
  const expectedPeriod = `${teamWeeks.at(-2).week_start}..${teamWeeks.at(-1).week_end}`;
  check("weeks", "All QAs shows 'Last 2 weeks', Monday-Friday, never 'days'", /Last 2 weeks/.test(dashAll) && /Monday–Friday/.test(dashAll) && !/Last 14 days|\d+-day/.test(dashAll));
  check("weeks", "All QAs period = previous + current calendar week", periodOf(dashAll) === expectedPeriod, `${periodOf(dashAll)} vs ${expectedPeriod}`);
  check("weeks", "current period starts on a Monday and ends on a Friday",
    new Date(`${teamWeeks.at(-2).week_start}T00:00:00Z`).getUTCDay() === 1 && new Date(`${teamWeeks.at(-1).week_end}T00:00:00Z`).getUTCDay() === 5);
  check("weeks", "2-week trends use 'Previous week' and 'Current week' buckets", /Previous week/.test(dashAll) && /Current week/.test(dashAll));
  const back1 = await (await get("/manager?back=1")).text();
  check("weeks", "previous period = the 2 weeks immediately before", periodOf(back1) === `${teamWeeks[0].week_start}..${teamWeeks[1].week_end}`, periodOf(back1));

  // A QA configured for 4 weeks: manager individual view follows that QA's setting.
  const testerUser = (await admin.from("profiles").select("id").eq("public_slug", "tester").single()).data;
  const setWeeks = await qa3.from("profiles").update({ reporting_period_weeks: 4 }).eq("id", testerUser.id).select("id");
  check("weeks", "QA can change own reporting weeks", !setWeeks.error && setWeeks.data?.length === 1, setWeeks.error?.message);
  const four = await (await get("/manager?qa=tester")).text();
  const fourWeeks = await weekly(testerUser.id, 4);
  check("weeks", "4-week QA shows 'Last 4 weeks' with Week 1-4 buckets", /Last 4 weeks/.test(four) && ["Week 1", "Week 2", "Week 3", "Week 4"].every((w) => four.includes(w)));
  check("weeks", "4-week period spans 4 Monday-Friday weeks", periodOf(four) === `${fourWeeks.at(-4).week_start}..${fourWeeks.at(-1).week_end}`, periodOf(four));
  check("weeks", "4-week metrics are the sum of those 4 weeks", metric(four, "test_cases_executed") === String(await expected(testerUser.id, 4)));
  check("weeks", "All QAs still uses the default 2 weeks", /Last 2 weeks/.test(await (await get("/manager")).text()));

  // QA dashboard uses the same weekly logic (own data only).
  const qaHome = await (await get("/qa", cookie)).text();
  const ownWeeks = await weekly(OWNER_ID, 2);
  check("weeks", "QA dashboard shows the same calendar-week period", /Last 2 weeks/.test(qaHome) && periodOf(qaHome) === `${ownWeeks.at(-2).week_start}..${ownWeeks.at(-1).week_end}`);
  check("weeks", "QA dashboard metrics are own-data weekly totals", metric(qaHome, "test_cases_executed") === String(await expected(OWNER_ID, 2)));
  const settings = await (await get("/qa/settings", cookie)).text();
  check("weeks", "Settings configures the period in weeks", /name="reporting_period_weeks"/.test(settings) && !/reporting_period_days|Period start date/.test(settings));

  // Ticket status vs QA completed date through the real API as the QA user (DB constraint).
  const bad1 = await qa.from("qa_records").insert({ owner_id: OWNER_ID, ticket_number: "ST-A", qa_status: "assigned", qa_completed_on: LAST_WEEKDAY });
  check("status", "assigned + completion date rejected", bad1.error?.code === "23514", bad1.error?.code);
  const bad2 = await qa.from("qa_records").insert({ owner_id: OWNER_ID, ticket_number: "ST-B", qa_status: "in_progress", qa_completed_on: LAST_WEEKDAY });
  check("status", "in progress + completion date rejected", bad2.error?.code === "23514", bad2.error?.code);
  const ok = await qa.from("qa_records").insert({ owner_id: OWNER_ID, ticket_number: "ST-C", qa_status: "qa_completed", qa_completed_on: LAST_WEEKDAY });
  check("status", "QA completed + completion date accepted", !ok.error, ok.error?.message);
  const back = await qa.from("qa_records").update({ qa_status: "in_progress" }).eq("ticket_number", "ST-C");
  check("status", "QA completed -> in progress keeping the date rejected", back.error?.code === "23514", back.error?.code);
  const cleared = await qa.from("qa_records").update({ qa_status: "in_progress", qa_completed_on: null }).eq("ticket_number", "ST-C").select("id");
  check("status", "QA completed -> in progress with date cleared accepted", !cleared.error && cleared.data?.length === 1, cleared.error?.message);
  const editPage = await (await get(`/qa/tickets/new`, cookie)).text();
  check("status", "new-ticket form renders the QA completed date field", /name="qa_completed_on"/.test(editPage));
}

// ---------------------------------------------------------------------------
// 7. Ticket detail: QA report actions and long evidence text (manager + QA)
// ---------------------------------------------------------------------------
{
  const cookie = await cookieHeader(qaSession);
  const reportTicket = (await admin.from("qa_records").select("id").eq("ticket_number", "AUDIT-2").single()).data.id;
  const LONG = "https://example.com/" + "x".repeat(400) + "/very-long-unbroken-evidence-identifier";
  const evid = await qa
    .from("qa_records")
    .insert({ owner_id: OWNER_ID, ticket_number: "EVID-1", qa_status: "assigned", data: { schema_version: 1, evidence: [{ description: LONG, location: "Image 1" }] } })
    .select("id")
    .single();
  const tag = (html, action) => new RegExp(`<a[^>]*data-report-action="${action}"[^>]*>`).exec(html)?.[0] ?? "";
  const cls = (t) => /class="([^"]*)"/.exec(t)?.[1];

  for (const [who, base, c] of [["manager", "/manager", undefined], ["QA", "/qa", cookie]]) {
    const html = await (await get(`${base}/tickets/${reportTicket}`, c)).text();
    const open = tag(html, "open");
    const download = tag(html, "download");
    check("report", `${who}: Open targets a new tab`, open.includes('target="_blank"') && open.includes(`href="${base}/documents/${docId}"`), open);
    check("report", `${who}: Download uses download behaviour`, /\sdownload="[^"]+"/.test(download) && download.includes(`href="${base}/documents/${docId}?download=1"`) && !download.includes("target="));
    check("report", `${who}: Open and Download share the same button styling`, !!cls(open) && cls(open) === cls(download) && /border/.test(cls(open)));

    const openRedirect = await get(`${base}/documents/${docId}`, c);
    const openUrl = openRedirect.headers.get("location") ?? "";
    const openFile = await fetch(openUrl);
    check("report", `${who}: Open serves the file inline (no attachment header)`, openRedirect.status === 307 && openFile.status === 200 && !/attachment/i.test(openFile.headers.get("content-disposition") ?? ""));
    const dlRedirect = await get(`${base}/documents/${docId}?download=1`, c);
    const dlFile = await fetch(dlRedirect.headers.get("location") ?? "");
    const disposition = dlFile.headers.get("content-disposition") ?? "";
    check("report", `${who}: Download is an attachment with the original file name`, dlFile.status === 200 && /attachment/i.test(disposition) && disposition.includes("audit-report.txt"), disposition);
    check("report", `${who}: file is served via a short-lived signed URL (bucket stays private)`, /\/object\/sign\//.test(openUrl) && /token=/.test(openUrl));

    const ev = await (await get(`${base}/tickets/${evid.data.id}`, c)).text();
    const item = /<li[^>]*data-evidence-item[^>]*>.*?<\/li>/.exec(ev)?.[0] ?? "";
    check("evidence", `${who}: long evidence text is rendered in full`, item.includes(LONG));
    check("evidence", `${who}: long evidence text wraps inside its card`, /<span class="[^"]*min-w-0[^"]*wrap-anywhere[^"]*">https:\/\/example.com/.test(item) && !/truncate|overflow-x-auto/.test(item));
  }
  const mgr = await (await get(`/manager/tickets/${reportTicket}`, cookie)).text();
  check("report", "manager ticket detail stays read-only (even signed in)", !/>Edit<|>Delete<|Upload QA report|Sign out/.test(mgr) && tag(mgr, "open") !== "");
  const qaDetail = await (await get(`/qa/tickets/${reportTicket}`, cookie)).text();
  check("report", "QA ticket detail keeps Edit/Delete alongside the report actions", />Edit</.test(qaDetail) && />Delete</.test(qaDetail) && tag(qaDetail, "download") !== "");
}

// ---------------------------------------------------------------------------
// 8. Regression: download filenames (no double encoding) and long bug titles
// ---------------------------------------------------------------------------
{
  const cookie = await cookieHeader(qaSession);
  const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const BUG_TITLE = "Prospective_Supplier_Registration_Approval_Group_missing_Ryan_Approver_in_GKOS_BPM_Approval_Groups_Configuration";
  // Same path sanitisation as the upload form; file_name keeps the original name.
  async function confirmedReport(fileName, ticketNumber) {
    const id = crypto.randomUUID();
    const path = `${OWNER_ID}/${id}/${fileName.replace(/[^\w.\- ]+/g, "_")}`;
    const up = await qa.storage.from(BUCKET).upload(path, new Blob(["x"], { type: DOCX }), { contentType: DOCX });
    if (up.error) throw up.error;
    await qa.from("qa_documents").insert({ id, owner_id: OWNER_ID, storage_path: path, file_name: fileName, mime_type: DOCX, size_bytes: 1 });
    await qa.from("qa_documents").update({ extraction_status: "ready_for_review" }).eq("id", id);
    const { data: recordId, error } = await qa.rpc("confirm_extraction", {
      p_document_id: id,
      p_record: { ticket_number: ticketNumber, qa_status: "qa_completed", qa_completed_on: LAST_WEEKDAY, data: { schema_version: 1, bugs: [{ ref: "Bug 1", title: BUG_TITLE, severity: "high", status: "open" }] } },
    });
    if (error) throw error;
    return { id, recordId };
  }
  const reports = [
    ["CHG0045893 - Break Fix QA (1).docx", "REG-PARENS"],
    ["CHG0046926 - QA Report.docx", "REG-PLAIN"],
  ];
  for (const [fileName, ticket] of reports) {
    const { id, recordId } = await confirmedReport(fileName, ticket);
    for (const [who, base, c] of [["manager", "/manager", undefined], ["QA", "/qa", cookie]]) {
      const redirect = await get(`${base}/documents/${id}?download=1`, c);
      const res = await fetch(redirect.headers.get("location") ?? "");
      const header = res.headers.get("content-disposition") ?? "";
      const star = /filename\*=UTF-8''([^;]+)/.exec(header)?.[1] ?? "";
      const plain = /filename=([^;]+)/.exec(header)?.[1] ?? "";
      check("filename", `${who}: "${fileName}" downloads with the exact original name`, decodeURIComponent(star) === fileName && decodeURIComponent(plain) === fileName, header);
      check("filename", `${who}: "${fileName}" has no %28/%29/%2528/%2529 artifacts`, !/%28|%29|%2528|%2529|%25/i.test(header), header);
      const open = await fetch((await get(`${base}/documents/${id}`, c)).headers.get("location") ?? "");
      check("filename", `${who}: "${fileName}" Open still has no attachment header`, open.status === 200 && !/attachment/i.test(open.headers.get("content-disposition") ?? ""));

      const html = await (await get(`${base}/tickets/${recordId}`, c)).text();
      const title = /<span class="([^"]*)" data-bug-title="true">([^<]*)<\/span>/.exec(html);
      check("bug-title", `${who}: long bug title rendered in full and set to wrap (${ticket})`, title?.[2] === BUG_TITLE && /min-w-0/.test(title?.[1] ?? "") && /wrap-anywhere/.test(title?.[1] ?? "") && !/truncate|overflow-hidden|overflow-x-auto/.test(title?.[1] ?? ""));
      check("bug-title", `${who}: ticket detail ${who === "manager" ? "has no edit/delete" : "keeps Edit/Delete"} (${ticket})`, who === "manager" ? !/>Edit<|>Delete</.test(html) : />Edit</.test(html) && />Delete</.test(html));
    }
  }
}

// ---------------------------------------------------------------------------
const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  [${r.area}] ${r.name}${!r.pass && r.detail ? ` — ${r.detail}` : ""}`);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
