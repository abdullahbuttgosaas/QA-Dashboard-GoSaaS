import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/actions/profile", () => ({ updateSettings: async () => ({ ok: true }) }));

const profile = {
  id: "00000000-0000-4000-8000-000000000001",
  display_name: "Abdullah Butt",
  public_slug: "abdullah",
  role: "qa" as const,
  reporting_period_weeks: 2,
};

async function render(siteUrl: string) {
  const { SettingsForm } = await import("./settings-form");
  return renderToStaticMarkup(<SettingsForm profile={profile} siteUrl={siteUrl} saved={false} />);
}

describe("Manager filter name field", () => {
  it("shows the full production URL prefix unchanged", async () => {
    const html = (await render("https://qa-dashboard-gosaas.vercel.app")).replace(/<!-- -->/g, "");
    expect(html).toMatch(/data-slug-prefix[^>]*>qa-dashboard-gosaas\.vercel\.app\/manager\?qa=<\/span>/);
    const slugInput = /<input[^>]*name="public_slug"[^>]*>/.exec(html)?.[0] ?? "";
    expect(slugInput).toContain('value="abdullah"');
  });

  it("lets a long prefix wrap and grow inside its container (no fixed height, no overflow)", async () => {
    const html = await render("https://qa-dashboard-gosaas.vercel.app");
    const prefix = /<span data-slug-prefix="true" class="([^"]*)"/.exec(html)?.[1] ?? "";
    expect(prefix).toMatch(/\bwrap-anywhere\b/);
    expect(prefix).toMatch(/\bmin-w-0\b/);
    expect(prefix).toMatch(/\bmin-h-9\b/);
    expect(prefix).not.toMatch(/(^|\s)h-9(\s|$)/); // a fixed height let wrapped text spill out of the box
    expect(prefix).not.toMatch(/truncate|overflow-hidden|whitespace-nowrap/);
  });

  it("stacks prefix above the input on phones and places them side by side from sm", async () => {
    const html = await render("https://qa-dashboard-gosaas.vercel.app");
    expect(html).toMatch(/<div class="flex min-w-0 flex-col sm:flex-row"><span data-slug-prefix/);
  });

  it("keeps the saved reporting-period setting (1-12 weeks, no Lifetime)", async () => {
    const html = await render("http://localhost:3000");
    const options = [...html.matchAll(/<select name="reporting_period_weeks"[\s\S]*?<\/select>/g)][0][0];
    expect([...options.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1])).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
  });
});
