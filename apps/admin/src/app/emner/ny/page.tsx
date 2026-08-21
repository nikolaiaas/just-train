import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { getAdminAccessSession } from "@/lib/auth/dal";

import { TopicDraftWorkspace } from "./topic-draft-workspace";
import {
  loadResumableTopicDraft,
  parseResumeTopicId,
} from "./resume-topic-draft";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type NewTopicPageProps = {
  searchParams: Promise<{ topic?: string | string[] }>;
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
    redirect("/");
  }

  const requestedTopic = query.topic;
  const topicId = parseResumeTopicId(requestedTopic);

  if (requestedTopic !== undefined && !topicId) {
    redirect("/");
  }

  const initialDraft = topicId
    ? await loadResumableTopicDraft(session.client, topicId)
    : null;

  if (topicId && !initialDraft) {
    redirect("/");
  }

  return (
    <TopicDraftWorkspace
      assistantRequestId={randomUUID()}
      exerciseRequestId={randomUUID()}
      goalRequestId={randomUUID()}
      initialDraft={initialDraft}
      profileName={session.access.profile.displayName}
      topicRequestId={randomUUID()}
    />
  );
}
