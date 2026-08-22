import type { AdminTopicStatus } from "@bare-traen/api-client";

export type TopicStatus = AdminTopicStatus;

export const topicStatusCopy = {
  published: {
    label: "Udgivet",
    detail: "Synligt i appen",
  },
  draft: {
    label: "Kladde",
    detail: "Ikke udgivet endnu",
  },
} as const satisfies Record<TopicStatus, { label: string; detail: string }>;

export const topicStatusFilterOptions = [
  { value: "all", label: "Alle statusser" },
  { value: "published", label: "Udgivet" },
  { value: "draft", label: "Kladde" },
] as const satisfies ReadonlyArray<{
  value: "all" | TopicStatus;
  label: string;
}>;

export function countDraftTopics(
  topics: ReadonlyArray<{ status: TopicStatus }>,
): number {
  return topics.filter((topic) => topic.status === "draft").length;
}
