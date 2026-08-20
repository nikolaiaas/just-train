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

export interface ConsoleTask {
  id: string;
  title: string;
  details: string;
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

export interface ConsoleSnapshot {
  csrfToken: string;
  console: {
    url: string;
    startedAt: string;
  };
  services: Record<ServiceId, ServiceState>;
  logs: Record<ServiceId, LogEntry[]>;
  tasks: TaskBoard;
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
