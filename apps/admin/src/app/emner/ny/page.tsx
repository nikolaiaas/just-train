import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { getAdminAccessSession } from "@/lib/auth/dal";

import { TopicDraftWorkspace } from "./topic-draft-workspace";
import {
  loadResumableTopicDraft,
  loadTopicEditorOutline,
  parseResumeTopicSelection,
} from "./resume-topic-draft";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type NewTopicPageProps = {
  searchParams: Promise<{
    add?: string | string[];
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

  const loadedTopic = selection.topicId
    ? await Promise.all([
        loadResumableTopicDraft(session.client, selection.topicId, {
          createExercise: selection.startingStep === "new-exercise",
          exerciseId: selection.exerciseId,
          goalId: selection.goalId,
        }),
        loadTopicEditorOutline(session.client, selection.topicId),
      ])
    : null;
  const initialDraft = loadedTopic?.[0] ?? null;
  const initialOutline = loadedTopic?.[1] ?? [];

  if (selection.topicId && !initialDraft) {
    redirect("/emner");
  }

  return (
    <TopicDraftWorkspace
      assistantRequestId={randomUUID()}
      exerciseRequestId={randomUUID()}
      goalRequestId={randomUUID()}
      initialDraft={initialDraft}
      initialOutline={initialOutline}
      initialStep={selection.startingStep}
      key={[
        selection.topicId ?? "new",
        selection.goalId ?? "no-goal",
        selection.exerciseId ?? selection.startingStep ?? "default",
      ].join(":")}
      profileName={session.access.profile.displayName}
      topicRequestId={randomUUID()}
      wardrobeRequestId={randomUUID()}
    />
  );
}
