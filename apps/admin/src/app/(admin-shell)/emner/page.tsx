import type { Metadata } from "next";

import {
  loadAdminTopicLibrary,
  type AdminTopicLibraryItem,
} from "@bare-traen/api-client";

import { ContentOverview, type Topic } from "../../content-overview";
import { getAdminAccessSession } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Emner · Bare Træn Administration",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatTopicUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Copenhagen",
  }).format(new Date(value));
}

function toOverviewTopic(topic: AdminTopicLibraryItem): Topic {
  return {
    id: topic.id,
    name: topic.title,
    emoji: topic.icon || "✨",
    goals: topic.goalCount,
    exercises: topic.exerciseCount,
    status: topic.status,
    updatedAt: formatTopicUpdatedAt(topic.updatedAt),
    description: topic.description,
  };
}

export default async function SubjectsPage() {
  const session = await getAdminAccessSession();

  if (session.access.kind !== "authorized" || !session.client) {
    return null;
  }

  const topicLibraryResult = await loadAdminTopicLibrary(session.client).then(
    (items) => ({ ok: true as const, items }),
    () => ({ ok: false as const, items: [] }),
  );

  return (
    <ContentOverview
      topics={topicLibraryResult.items.map(toOverviewTopic)}
      unavailable={!topicLibraryResult.ok}
    />
  );
}
