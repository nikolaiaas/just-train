import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getAdminAccessSession } from "@/lib/auth/dal";
import { parseSkillBuilderMode } from "@/app/emner/skill-package";

import { loadAdminTopicDetail } from "../../data";
import { SkillPackageWorkspace } from "./skill-package-workspace";

export const metadata: Metadata = {
  title: "Ny færdighed · Bare Træn Administration",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

type NewSkillPageProps = {
  params: Promise<{ topicId: string }>;
  searchParams: Promise<{ mode?: string | string[] }>;
};

export default async function NewSkillPage({
  params,
  searchParams,
}: NewSkillPageProps) {
  const [session, routeParams, query] = await Promise.all([
    getAdminAccessSession(),
    params,
    searchParams,
  ]);

  if (session.access.kind === "unauthenticated") redirect("/login");
  if (session.access.kind !== "authorized" || !session.client) {
    redirect("/emner");
  }

  const topic = await loadAdminTopicDetail(session.client, routeParams.topicId);
  if (!topic) notFound();

  return (
    <SkillPackageWorkspace
      existingSkills={topic.goals.map((goal) => ({
        childDescription: goal.summary,
        title: goal.title,
      }))}
      initialMode={parseSkillBuilderMode(query.mode)}
      packageRequestId={randomUUID()}
      suggestionRequestId={randomUUID()}
      topic={{
        description: topic.description,
        id: topic.id,
        status: topic.status,
        title: topic.title,
        updatedAt: topic.updatedAt,
      }}
    />
  );
}
