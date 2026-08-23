export type TopicLifecycleOperation = "delete" | "publish" | "unpublish";

export type TopicLifecycleActionState = {
  message: string;
  operation: TopicLifecycleOperation | null;
  status: "denied" | "idle" | "invalid" | "success" | "unavailable";
};
