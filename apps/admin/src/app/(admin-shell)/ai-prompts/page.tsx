import type { Metadata } from "next";

import { getAiPromptCatalog } from "../../ai-prompts/data";
import { AiPromptWorkspace } from "../../ai-prompts/prompt-workspace";
import { getAdminAccessSession } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "AI-prompter · Bare Træn Administration",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AiPromptsPage() {
  const session = await getAdminAccessSession();

  if (session.access.kind !== "authorized" || !session.client) {
    return null;
  }

  const catalog = await getAiPromptCatalog(
    session.client,
    session.access.profile,
  );

  return <AiPromptWorkspace catalog={catalog} />;
}
