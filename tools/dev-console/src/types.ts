export type ServiceId = "supabase" | "admin" | "mobileWeb" | "iphoneMetro";

export type ServiceStatus =
  "stopped" | "starting" | "running" | "stopping" | "external" | "error";

export type ServiceOwnership =
  "console" | "verified-repository" | "unknown" | "none" | "repository";

export interface ServiceState {
  id: ServiceId;
  label: string;
  status: ServiceStatus;
  managed: boolean;
  stoppable: boolean;
  ownership: ServiceOwnership;
  port: number | null;
  url: string | null;
  studioUrl?: string | null;
  detail: string | null;
  lastError: string | null;
}

export interface LogEntry {
  at: string;
  stream: "stdout" | "stderr" | "system";
  text: string;
}

export type TaskStatus = "backlog" | "todo" | "doing" | "done";

export interface TaskImageEvidence {
  kind: "image";
  label: string;
  path: string;
}

export interface TaskLinkEvidence {
  kind: "link";
  label: string;
  url: string;
}

export type TaskEvidence = TaskImageEvidence | TaskLinkEvidence;

export interface ConsoleTask {
  id: string;
  title: string;
  details: string;
  implementationNotes: string;
  evidence: TaskEvidence[];
  status: TaskStatus;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskBoard {
  version: number;
  updatedAt: string | null;
  items: ConsoleTask[];
}

export interface GitSummary {
  branch?: string;
  commit?: string;
  shortCommit?: string;
  clean?: boolean;
  changedCount?: number | null;
  status?: string;
}

export type IphonePreviewStatus =
  "checking" | "ready" | "needs-build" | "queued" | "building" | "error";

export interface IphonePreviewState {
  status: IphonePreviewStatus;
  message: string;
  version: string | null;
  checkedAt: string | null;
}

export interface ConsoleSnapshot {
  csrfToken: string;
  console: {
    url: string;
    startedAt: string;
  };
  services: Record<ServiceId, ServiceState>;
  logs: Record<ServiceId, LogEntry[]>;
  tasks: TaskBoard;
  iphonePreview: IphonePreviewState;
  git?: GitSummary;
}

export interface ApiErrorPayload {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export interface ActionResponse {
  ok: true;
  state: ConsoleSnapshot;
}

export interface TasksResponse {
  ok: true;
  tasks: TaskBoard;
}
