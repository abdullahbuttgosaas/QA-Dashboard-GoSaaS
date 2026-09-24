import type { Metadata } from "next";
import { headers } from "next/headers";
import { requireQa } from "@/services/profiles";
import { SettingsForm } from "@/components/settings-form";
import { Card } from "@/components/ui/card";
import { siteOrigin } from "@/lib/site";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/qa/settings">) {
  const { saved } = await searchParams;
  const { profile } = await requireQa("/qa/settings");
  const origin = siteOrigin(await headers());

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-ink">Settings</h1>
      <Card className="p-6">
        <SettingsForm profile={profile} siteUrl={origin} saved={saved === "1"} />
      </Card>
    </div>
  );
}
