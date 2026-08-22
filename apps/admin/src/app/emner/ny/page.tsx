import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { getAdminAccessSession } from "@/lib/auth/dal";

import { TopicDraftWorkspace } from "./topic-draft-workspace";
import {
  loadResumableTopicDraft,
  parseResumeTopicSelection,
} from "./resume-topic-draft";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type NewTopicPageProps = {
  searchParams: Promise<{
    exercise?: string | string[];
    goal?: string | string[];
    topic?: string | string[];
  }>;
};

export default async function NewTopicPage({
  searchParams,
}: NewTopicPageProps) {
  const [session, query] = await Promise.all([
    getAdminAccessSession(),
    searchParams,
  ]);

  if (session.access.kind === "unauthenticated") {
    redirect("/login");
  }

  if (session.access.kind === "unavailable") {
    redirect("/login?reason=configuration");
  }

  if (session.access.kind === "denied" || !session.client) {
    redirect("/emner");
  }

  const selection = parseResumeTopicSelection(query);

  if (!selection) {
    redirect("/emner");
  }

  const initialDraft = selection.topicId
    ? await loadResumableTopicDraft(session.client, selection.topicId, {
        exerciseId: selection.exerciseId,
        goalId: selection.goalId,
      })
    : null;

  if (selection.topicId && !initialDraft) {
    redirect("/emner");
  }

  return (
    <TopicDraftWorkspace
      assistantRequestId={randomUUID()}
      exerciseRequestId={randomUUID()}
      goalRequestId={randomUUID()}
      initialDraft={initialDraft}
      initialStep={selection.startingStep}
      profileName={session.access.profile.displayName}
      topicRequestId={randomUUID()}
      wardrobeRequestId={randomUUID()}
    />
  );
}
