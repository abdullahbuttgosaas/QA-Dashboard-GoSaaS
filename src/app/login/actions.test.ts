import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithPassword = vi.fn();
const signUp = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword, signUp } }),
}));

// next/navigation's redirect throws to stop rendering; capture the destination instead.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

async function redirectOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (e) {
    return (e as { url?: string }).url;
  }
}

describe("signIn action", () => {
  beforeEach(() => {
    signInWithPassword.mockReset().mockResolvedValue({ error: null });
    signUp.mockReset();
  });

  it("sends a successful QA sign-in to /qa (never /manager)", async () => {
    const { signIn } = await import("./actions");
    const url = await redirectOf(signIn({}, form({ email: "abdullah.butt@gosaas.ai", password: "pw-12345678" })));
    expect(url).toBe("/qa");
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "abdullah.butt@gosaas.ai", password: "pw-12345678" });
  });

  it("honours a safe ?next= path and ignores unsafe ones", async () => {
    const { signIn } = await import("./actions");
    expect(await redirectOf(signIn({}, form({ email: "a@gosaas.ai", password: "pw-12345678", next: "/qa/upload" })))).toBe("/qa/upload");
    expect(await redirectOf(signIn({}, form({ email: "a@gosaas.ai", password: "pw-12345678", next: "https://evil.com" })))).toBe("/qa");
  });

  it("rejects other domains before calling Supabase", async () => {
    const { signIn } = await import("./actions");
    const result = await signIn({}, form({ email: "someone@gmail.com", password: "pw-12345678" }));
    expect(result.error).toMatch(/Only @gosaas.ai/);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("shows a generic error for wrong credentials", async () => {
    signInWithPassword.mockResolvedValue({ error: { status: 400, code: "invalid_credentials", message: "Invalid login credentials" } });
    const { signIn } = await import("./actions");
    const result = await signIn({}, form({ email: "abdullah.butt@gosaas.ai", password: "wrong-password" }));
    expect(result.error).toBe("Incorrect email or password.");
  });
});

describe("signUp action", () => {
  it("sends a new QA straight to /qa", async () => {
    signUp.mockResolvedValue({ data: { session: {}, user: {} }, error: null });
    const { signUp: action } = await import("./actions");
    const url = await redirectOf(action({}, form({ email: "new.qa@gosaas.ai", password: "pw-12345678", confirm: "pw-12345678" })));
    expect(url).toBe("/qa");
  });
});
