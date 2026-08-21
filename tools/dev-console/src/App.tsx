import {
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Icon, type IconName } from "./icons";
import type {
  ActionResponse,
  ConsoleSnapshot,
  ConsoleTask,
  IphonePreviewState,
  LogEntry,
  ServiceId,
  ServiceOwnership,
  ServiceState,
  ServiceStatus,
  TaskBoard,
  TaskEvidence,
  TaskStatus,
  TasksResponse,
} from "./types";

const POLL_INTERVAL_MS = 4_000;
const HIDE_DONE_STORAGE_KEY = "bare-traen-dev-console-hide-done-v1";

const SERVICE_ORDER: ServiceId[] = [
  "supabase",
  "admin",
  "mobileWeb",
  "iphoneMetro",
];

const SERVICE_META: Record<
  ServiceId,
  {
    title: string;
    shortTitle: string;
    description: string;
    icon: IconName;
    fallbackPort: number;
  }
> = {
  supabase: {
    title: "Lokal Supabase",
    shortTitle: "Supabase",
    description: "Database, login, Storage og andre lokale backend-tjenester.",
    icon: "database",
    fallbackPort: 54321,
  },
  admin: {
    title: "Administration",
    shortTitle: "Admin",
    description: "Websiden til at oprette og vedligeholde træningsindhold.",
    icon: "browser",
    fallbackPort: 11000,
  },
  mobileWeb: {
    title: "Mobil i Safari",
    shortTitle: "Mobilweb",
    description: "Den hurtige mobilvisning til skærm- og designarbejde.",
    icon: "phone",
    fallbackPort: 11001,
  },
  iphoneMetro: {
    title: "iPhone Metro",
    shortTitle: "iPhone",
    description:
      "Forbinder Bare Træn Dev på din iPhone med koden på denne Mac.",
    icon: "signal",
    fallbackPort: 11001,
  },
};

const STATUS_META: Record<
  ServiceStatus,
  { label: string; description: string }
> = {
  stopped: { label: "Stoppet", description: "Klar til at blive startet." },
  starting: {
    label: "Starter…",
    description: "Vent et øjeblik, mens tjenesten starter.",
  },
  running: { label: "Kører", description: "Tjenesten er klar til brug." },
  stopping: { label: "Stopper…", description: "Tjenesten lukker sikkert ned." },
  external: {
    label: "Kører",
    description: "Tjenesten kører uden for dette kontrolpanel.",
  },
  error: {
    label: "Fejl",
    description: "Tjenesten kunne ikke udføre handlingen.",
  },
};

const TASK_COLUMNS: Array<{
  status: TaskStatus;
  label: string;
  shortDescription: string;
  icon: IconName;
}> = [
  {
    status: "backlog",
    label: "Backlog",
    shortDescription: "Gode idéer og senere arbejde",
    icon: "list",
  },
  {
    status: "todo",
    label: "To do",
    shortDescription: "Klar til at blive taget",
    icon: "arrow",
  },
  {
    status: "doing",
    label: "Doing",
    shortDescription: "Det vi arbejder på nu",
    icon: "play",
  },
  {
    status: "done",
    label: "Done",
    shortDescription: "Afsluttet arbejde",
    icon: "check",
  },
];

const NAVIGATION: Array<{ path: RoutePath; label: string; icon: IconName }> = [
  { path: "/", label: "Overblik", icon: "home" },
  { path: "/services", label: "Tjenester", icon: "browser" },
  { path: "/tasks", label: "Opgaver", icon: "tasks" },
];

const QUICK_LINKS: Array<{
  label: string;
  detail: string;
  href: string;
  icon: IconName;
}> = [
  {
    label: "Administration",
    detail: "port 11000",
    href: "http://localhost:11000",
    icon: "browser",
  },
  {
    label: "Mobil i Safari",
    detail: "port 11001",
    href: "http://localhost:11001",
    icon: "phone",
  },
  {
    label: "Supabase Studio",
    detail: "port 54323",
    href: "http://localhost:54323",
    icon: "database",
  },
  {
    label: "Testmails",
    detail: "port 54324",
    href: "http://localhost:54324",
    icon: "mail",
  },
];

type RoutePath = "/" | "/services" | "/tasks" | "/not-found";
type AggregateAction =
  "start-local-web" | "stop-my-apps" | "prepare-iphone-preview";
type ServiceAction = "start" | "stop";
type ToastKind = "success" | "error";

interface ToastMessage {
  id: number;
  kind: ToastKind;
  message: string;
}

interface TaskDraft {
  title: string;
  details: string;
  implementationNotes: string;
  evidence: TaskEvidence[];
  status: TaskStatus;
}

interface TaskDialogState {
  mode: "create" | "edit";
  task?: ConsoleTask;
}

interface TaskDropTarget {
  status: TaskStatus;
  beforeTaskId: string | null;
}

function isRoutePath(value: string): value is Exclude<RoutePath, "/not-found"> {
  return value === "/" || value === "/services" || value === "/tasks";
}

function currentRoute(): RoutePath {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  return isRoutePath(path) ? path : "/not-found";
}

function isModifiedClick(event: ReactMouseEvent<HTMLAnchorElement>) {
  return (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  );
}

function safeLocalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname))
      return null;
    return url.href;
  } catch {
    return null;
  }
}

function normalizeServiceStatus(value: string | undefined): ServiceStatus {
  return value === "stopped" ||
    value === "starting" ||
    value === "running" ||
    value === "stopping" ||
    value === "external" ||
    value === "error"
    ? value
    : "stopped";
}

function normalizeTaskStatus(value: string): TaskStatus {
  if (value === "in-progress") return "doing";
  if (value === "blocked") return "backlog";
  return value === "backlog" ||
    value === "todo" ||
    value === "doing" ||
    value === "done"
    ? value
    : "backlog";
}

function normalizeTasks(tasks: ConsoleTask[]): ConsoleTask[] {
  return tasks.map((task) => ({
    ...task,
    implementationNotes:
      typeof task.implementationNotes === "string"
        ? task.implementationNotes
        : "",
    evidence: Array.isArray(task.evidence)
      ? task.evidence.filter(isTaskEvidence)
      : [],
    status: normalizeTaskStatus(task.status),
    priority:
      Number.isInteger(task.priority) && task.priority >= 0 ? task.priority : 0,
  }));
}

function isTaskEvidence(value: unknown): value is TaskEvidence {
  if (!value || typeof value !== "object" || !("kind" in value)) return false;
  if (
    value.kind === "image" &&
    "label" in value &&
    typeof value.label === "string" &&
    "path" in value &&
    typeof value.path === "string"
  ) {
    return true;
  }
  return (
    value.kind === "link" &&
    "label" in value &&
    typeof value.label === "string" &&
    "url" in value &&
    typeof value.url === "string"
  );
}

function evidenceImageUrl(imagePath: string): string | null {
  if (
    !/^[a-z0-9][a-z0-9_-]{0,63}\/[a-z0-9][a-z0-9._-]{0,127}\.(?:jpe?g|png|webp)$/.test(
      imagePath,
    )
  ) {
    return null;
  }
  return `/api/evidence/${imagePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function safeEvidenceLink(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function serviceStatusLabel(service: ServiceState): string {
  if (service.status === "external" && service.ownership === "unknown")
    return "Beskyttet";
  if (service.status === "external" && service.stoppable)
    return "Kører · bekræftet";
  return STATUS_META[normalizeServiceStatus(service.status)].label;
}

function ownershipLabel(ownership: ServiceOwnership): string {
  switch (ownership) {
    case "console":
      return "Startet fra panelet";
    case "verified-repository":
      return "Bekræftet Bare Træn-proces";
    case "repository":
      return "Bare Træn Supabase";
    case "unknown":
      return "Ukendt proces · beskyttet";
    case "none":
      return "Ikke i gang";
  }
}

function statusTone(status: ServiceStatus, ownership?: ServiceOwnership) {
  if (status === "error") return "border-[#e9c5be] bg-[#fff0ed] text-danger";
  if (status === "starting" || status === "stopping") {
    return "border-[#ebd89c] bg-[#fff5d8] text-warning";
  }
  if (status === "running")
    return "border-[#bcded0] bg-[#e7f6ec] text-[#23764c]";
  if (status === "external" && ownership === "unknown") {
    return "border-[#d8c9a3] bg-soft-warm text-[#765d1f]";
  }
  if (status === "external")
    return "border-[#c7d8df] bg-[#eff4f6] text-[#48697d]";
  return "border-line bg-[#f5f7f8] text-muted";
}

function serviceAccent(status: ServiceStatus, ownership?: ServiceOwnership) {
  if (status === "running") return "bg-success";
  if (status === "starting" || status === "stopping") return "bg-[#d8a92e]";
  if (status === "error") return "bg-danger";
  if (status === "external" && ownership === "unknown") return "bg-[#b28a37]";
  if (status === "external") return "bg-[#708ba2]";
  return "bg-line-strong";
}

function formatTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "ukendt tidspunkt";
  return new Intl.DateTimeFormat("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ukendt";
  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "short",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(date);
}

function formatLogEntry(entry: LogEntry): string {
  const stream = entry.stream === "stdout" ? "" : ` ${entry.stream}`;
  return `${formatTime(entry.at)}${stream}  ${entry.text}`;
}

function taskStatusLabel(status: TaskStatus): string {
  return (
    TASK_COLUMNS.find((column) => column.status === status)?.label ?? status
  );
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  if ("error" in payload) {
    const error = payload.error;
    if (typeof error === "string") return error;
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      return error.message;
    }
  }
  if ("message" in payload && typeof payload.message === "string")
    return payload.message;
  return fallback;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const contentType = response.headers.get("content-type") ?? "";
  const payload: unknown = contentType.includes("application/json")
    ? await response.json()
    : null;
  if (
    !response.ok ||
    (payload &&
      typeof payload === "object" &&
      "ok" in payload &&
      payload.ok === false)
  ) {
    throw new Error(
      extractErrorMessage(payload, "Handlingen kunne ikke gennemføres."),
    );
  }
  return payload as T;
}

function mutationHeaders(csrfToken: string): HeadersInit {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-CSRF-Token": csrfToken,
  };
}

function Button({
  children,
  icon,
  variant = "secondary",
  size = "default",
  className = "",
  ...props
}: {
  children: ReactNode;
  icon?: IconName;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  size?: "default" | "large" | "small";
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    primary:
      "border-brand-deep bg-brand text-white shadow-[0_7px_16px_rgba(8,124,120,0.20)] hover:bg-brand-deep",
    secondary:
      "border-line-strong bg-white/80 text-ink hover:border-[#91aab4] hover:bg-white",
    quiet:
      "border-line bg-transparent text-muted hover:border-line-strong hover:bg-[#f7faf9] hover:text-ink",
    danger:
      "border-[#e1b9b2] bg-[#fff0ed] text-danger hover:border-[#cf8f86] hover:bg-[#ffe5e0]",
  };
  const sizes = {
    small: "min-h-8 rounded-lg px-2.5 py-1.5 text-[11px]",
    default: "min-h-10 rounded-xl px-3.5 py-2 text-[12px]",
    large: "min-h-12 rounded-[14px] px-4.5 py-3 text-[13px]",
  };

  return (
    <button
      className={`inline-flex cursor-pointer items-center justify-center gap-2 border font-[750] transition duration-150 hover:not-disabled:-translate-y-px disabled:cursor-wait disabled:opacity-55 ${variants[variant]} ${sizes[size]} ${className}`}
      type="button"
      {...props}
    >
      {icon ? (
        <Icon
          className={size === "small" ? "size-3.5" : "size-4.5"}
          name={icon}
        />
      ) : null}
      {children}
    </button>
  );
}

function LocalLink({
  href,
  children,
  className = "",
  label,
}: {
  href: string | null | undefined;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  const safeHref = safeLocalUrl(href);
  if (!safeHref) return null;
  return (
    <a
      aria-label={label}
      className={className}
      href={safeHref}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}

function RouteLink({
  to,
  navigate,
  children,
  className = "",
  onNavigate,
}: {
  to: string;
  navigate: (to: string) => void;
  children: ReactNode;
  className?: string;
  onNavigate?: () => void;
}) {
  return (
    <a
      className={className}
      href={to}
      onClick={(event) => {
        if (isModifiedClick(event)) return;
        event.preventDefault();
        navigate(to);
        onNavigate?.();
      }}
    >
      {children}
    </a>
  );
}

function SectionHeading({
  kicker,
  title,
  description,
  actions,
}: {
  kicker: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="mb-1.5 text-[10px] font-extrabold tracking-[0.13em] text-brand uppercase">
          {kicker}
        </p>
        <h2 className="text-[clamp(1.45rem,2.3vw,1.9rem)] font-[650] tracking-[-0.03em] text-ink">
          {title}
        </h2>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}

function StatusBadge({ service }: { service: ServiceState }) {
  const status = normalizeServiceStatus(service.status);
  return (
    <span
      className={`inline-flex min-h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-extrabold tracking-[0.02em] ${statusTone(status, service.ownership)}`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full bg-current ${status === "starting" || status === "stopping" ? "animate-pulse" : ""}`}
      />
      {serviceStatusLabel(service)}
    </span>
  );
}

function EmptyServiceCard({ serviceId }: { serviceId: ServiceId }) {
  const meta = SERVICE_META[serviceId];
  return (
    <article className="min-h-44 animate-pulse rounded-[18px] border border-line bg-white/70 p-4">
      <span className="block size-10 rounded-xl bg-[#e8eeee]" />
      <span className="mt-5 block h-3 w-2/3 rounded bg-[#e8eeee]" />
      <span className="mt-3 block h-2.5 w-full rounded bg-[#eef1f0]" />
      <span className="sr-only">Henter {meta.title}</span>
    </article>
  );
}

function IphonePreviewPanel({
  preview,
  pending,
  prepare,
}: {
  preview: IphonePreviewState | null | undefined;
  pending: boolean;
  prepare: () => Promise<void>;
}) {
  const status = preview?.status ?? "checking";
  const buildInProgress = status === "queued" || status === "building";
  const checking = status === "checking";
  const ready = status === "ready";
  const hasError = status === "error";
  const buttonLabel = buildInProgress
    ? "Bygger iPhone-version…"
    : checking
      ? "Kontrollerer version…"
      : hasError
        ? "Prøv igen"
        : "Installér på iPhone";
  const statusLabel = ready
    ? "Klar til installation"
    : buildInProgress
      ? "Bygger"
      : status === "needs-build"
        ? "Ny build nødvendig"
        : hasError
          ? "Kræver opmærksomhed"
          : "Kontrollerer";
  const statusClasses = ready
    ? "border-[#bcded0] bg-[#e7f6ec] text-[#23764c]"
    : hasError
      ? "border-[#e9c5be] bg-[#fff0ed] text-danger"
      : "border-[#ebd89c] bg-[#fff5d8] text-warning";

  const handlePrepare = () => {
    if (
      status === "needs-build" &&
      !window.confirm(
        "Der findes ikke en aktuel iPhone-version af mobilkoden. Start et nyt privat EAS Preview-build? Det tager normalt nogle minutter.",
      )
    ) {
      return;
    }
    void prepare();
  };

  return (
    <section
      aria-labelledby="iphone-preview-title"
      className="mt-5 grid gap-5 overflow-hidden rounded-[22px] border border-[#c9dce3] bg-[#f3f8fa] p-5 shadow-[0_4px_14px_rgba(22,50,79,0.035)] sm:p-6 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-[15px] bg-[#dcecf1] text-brand-deep">
        <Icon className="size-6" name="phone" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2
            className="text-[16px] font-[760] tracking-[-0.015em] text-ink"
            id="iphone-preview-title"
          >
            Bare Træn Preview på iPhone
          </h2>
          <span
            aria-live="polite"
            className={`inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-extrabold ${statusClasses}`}
          >
            <span
              aria-hidden="true"
              className={`size-1.5 rounded-full bg-current ${buildInProgress || checking ? "animate-pulse" : ""}`}
            />
            {statusLabel}
          </span>
        </div>
        <p className="mt-2 max-w-3xl text-[12px] leading-5 text-muted">
          {preview?.message ??
            "Kontrollerer, om den nyeste mobilkode allerede findes som et standalone-preview."}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {preview?.version ? (
            <span className="rounded-full border border-[#c9dce3] bg-white/75 px-2 py-1 font-mono text-[9px] text-muted">
              Version {preview.version}
            </span>
          ) : null}
          <span className="rounded-full border border-[#c9dce3] bg-white/75 px-2 py-1 text-[9px] font-bold text-muted">
            Preview · uden Metro
          </span>
          <span className="rounded-full border border-[#c9dce3] bg-white/75 px-2 py-1 text-[9px] font-bold text-muted">
            Hosted Development
          </span>
        </div>
        <p className="mt-1 text-[10px] leading-4 text-muted">
          Bruger Hosted Development og virker uden Metro eller en lokal server.
          Hvis mobilkoden er nyere, laver knappen automatisk ét nyt build først.
        </p>
      </div>
      <Button
        aria-busy={pending || buildInProgress || checking}
        disabled={pending || buildInProgress || checking}
        icon={buildInProgress || checking ? "refresh" : "phone"}
        onClick={handlePrepare}
        size="large"
        variant={ready ? "primary" : "secondary"}
      >
        {buttonLabel}
      </Button>
    </section>
  );
}

function OverviewPage({
  snapshot,
  navigate,
  pendingActions,
  prepareIphonePreview,
  runAggregateAction,
  refresh,
  refreshing,
}: {
  snapshot: ConsoleSnapshot | null;
  navigate: (to: string) => void;
  pendingActions: Set<string>;
  prepareIphonePreview: () => Promise<void>;
  runAggregateAction: (action: AggregateAction) => Promise<void>;
  refresh: (manual?: boolean) => Promise<void>;
  refreshing: boolean;
}) {
  const tasks = normalizeTasks(snapshot?.tasks.items ?? []);
  const counts = Object.fromEntries(
    TASK_COLUMNS.map(({ status }) => [
      status,
      tasks.filter((task) => task.status === status).length,
    ]),
  ) as Record<TaskStatus, number>;

  return (
    <div>
      <section className="grid gap-8 overflow-hidden rounded-[26px] border border-line bg-paper p-6 shadow-soft sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:p-10">
        <div className="max-w-3xl">
          <p className="mb-2 text-[10px] font-extrabold tracking-[0.14em] text-brand uppercase">
            Lokal udvikling · port 11009
          </p>
          <h1
            className="max-w-3xl text-[clamp(2.35rem,5vw,4.6rem)] leading-[1.01] font-[640] tracking-[-0.052em] text-ink outline-none"
            data-page-heading
            tabIndex={-1}
          >
            God arbejdslyst.
          </h1>
          <p className="mt-4 max-w-2xl text-[clamp(0.95rem,1.5vw,1.1rem)] leading-7 text-muted">
            Start de lokale tjenester, åbn de rigtige previews og se, hvad der
            er næste skridt — uden at skrive kommandoer i Terminal.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5 lg:max-w-[360px] lg:justify-end">
          <Button
            aria-busy={pendingActions.has("start-local-web")}
            disabled={!snapshot || pendingActions.has("start-local-web")}
            icon="play"
            onClick={() => void runAggregateAction("start-local-web")}
            size="large"
            variant="primary"
          >
            Start lokale tjenester
          </Button>
          <Button
            aria-busy={pendingActions.has("stop-my-apps")}
            disabled={!snapshot || pendingActions.has("stop-my-apps")}
            icon="stop"
            onClick={() => void runAggregateAction("stop-my-apps")}
            size="large"
          >
            Stop lokale tjenester
          </Button>
          <Button
            aria-label="Opdatér status"
            disabled={refreshing}
            icon="refresh"
            onClick={() => void refresh(true)}
            size="large"
            variant="quiet"
          >
            <span className="sr-only">Opdatér status</span>
          </Button>
        </div>
      </section>

      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#cde6df] bg-[#effaf6] p-4 text-[#245c47]">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#d9f2e8] text-[#26754f]">
          <Icon className="size-5" name="shield" />
        </span>
        <div>
          <h2 className="text-[13px] font-[750]">Kun på denne Mac</h2>
          <p className="mt-0.5 text-[12px] leading-5 text-[#45705e]">
            Kontrolpanelet lytter kun på{" "}
            <code className="rounded bg-ink/6 px-1 py-0.5">127.0.0.1</code>.
            Start ændrer ikke appenes valgte backend: de følger fortsat{" "}
            <code className="rounded bg-ink/6 px-1 py-0.5">.env.local</code>,
            som normalt peger på Hosted Development. Panelet har ingen
            produktionsknapper.
          </p>
        </div>
      </div>

      <IphonePreviewPanel
        pending={pendingActions.has("prepare-iphone-preview")}
        prepare={prepareIphonePreview}
        preview={snapshot?.iphonePreview}
      />

      <section className="mt-11" aria-labelledby="overview-services-title">
        <SectionHeading
          actions={
            <RouteLink
              className="inline-flex items-center gap-1.5 text-[12px] font-bold text-brand-deep hover:underline"
              navigate={navigate}
              to="/services"
            >
              Se alle tjenester <Icon className="size-4" name="chevron" />
            </RouteLink>
          }
          kicker="Status lige nu"
          title="Tjenester"
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {SERVICE_ORDER.map((serviceId) => {
            const service = snapshot?.services[serviceId];
            if (!service)
              return <EmptyServiceCard key={serviceId} serviceId={serviceId} />;
            const meta = SERVICE_META[serviceId];
            const status = normalizeServiceStatus(service.status);
            return (
              <RouteLink
                className="group relative min-w-0 overflow-hidden rounded-[18px] border border-line bg-white p-4 shadow-[0_4px_14px_rgba(22,50,79,0.04)] transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-soft"
                key={serviceId}
                navigate={navigate}
                to={`/services#service-${serviceId}`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-0 top-0 h-[3px] ${serviceAccent(status, service.ownership)}`}
                />
                <span className="flex items-start justify-between gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-soft text-brand-deep">
                    <Icon className="size-5" name={meta.icon} />
                  </span>
                  <StatusBadge service={service} />
                </span>
                <span className="mt-5 block truncate text-[14px] font-[760] text-ink">
                  {meta.title}
                </span>
                <span className="mt-1 block font-mono text-[9px] text-muted">
                  port {service.port ?? meta.fallbackPort}
                </span>
                <span className="mt-4 inline-flex items-center gap-1 text-[10px] font-bold text-brand-deep opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                  Se detaljer <Icon className="size-3" name="arrow" />
                </span>
              </RouteLink>
            );
          })}
        </div>
      </section>

      <section className="mt-11" aria-labelledby="overview-tasks-title">
        <SectionHeading
          actions={
            <RouteLink
              className="inline-flex items-center gap-1.5 text-[12px] font-bold text-brand-deep hover:underline"
              navigate={navigate}
              to="/tasks"
            >
              Åbn opgavetavlen <Icon className="size-4" name="chevron" />
            </RouteLink>
          }
          kicker="Planen"
          title="Opgaver"
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {TASK_COLUMNS.map((column) => (
            <RouteLink
              className="group rounded-[18px] border border-line bg-[#f9f8f3] p-4 transition hover:border-line-strong hover:bg-white"
              key={column.status}
              navigate={navigate}
              to={`/tasks#${column.status}`}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-extrabold tracking-[0.04em] text-muted uppercase">
                  {column.label}
                </span>
                <Icon className="size-4 text-brand" name={column.icon} />
              </span>
              <span className="mt-4 block text-4xl font-[620] tracking-[-0.05em] text-ink">
                {snapshot ? counts[column.status] : "—"}
              </span>
              <span className="mt-1 block text-[10px] leading-4 text-muted">
                {column.shortDescription}
              </span>
            </RouteLink>
          ))}
        </div>
      </section>

      <section className="mt-11" aria-labelledby="quick-links-title">
        <SectionHeading kicker="Åbn med ét klik" title="Lokale adresser" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {QUICK_LINKS.map((link) => (
            <LocalLink
              className="group flex min-h-20 items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-soft"
              href={link.href}
              key={link.href}
              label={`Åbn ${link.label} i en ny fane`}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-soft text-brand-deep">
                <Icon className="size-5" name={link.icon} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-[750] text-ink">
                  {link.label}
                </span>
                <span className="mt-0.5 block font-mono text-[9px] text-muted">
                  {link.detail}
                </span>
              </span>
              <Icon
                className="size-4 text-muted transition group-hover:text-brand"
                name="external"
              />
            </LocalLink>
          ))}
        </div>
      </section>
    </div>
  );
}

function ServiceCard({
  service,
  serviceId,
  pending,
  runServiceAction,
  showLogs,
}: {
  service: ServiceState;
  serviceId: ServiceId;
  pending: Set<string>;
  runServiceAction: (
    action: ServiceAction,
    serviceId: ServiceId,
  ) => Promise<void>;
  showLogs: (serviceId: ServiceId) => void;
}) {
  const meta = SERVICE_META[serviceId];
  const status = normalizeServiceStatus(service.status);
  const transition = status === "starting" || status === "stopping";
  const canStart = status === "stopped" || status === "error";
  const canStop =
    service.stoppable && (status === "running" || status === "external");
  const protectedProcess =
    status === "external" &&
    service.ownership === "unknown" &&
    !service.stoppable;
  const primaryUrl = safeLocalUrl(
    serviceId === "supabase"
      ? service.studioUrl || "http://localhost:54323"
      : service.url,
  );
  const actionPending =
    pending.has(`start:${serviceId}`) || pending.has(`stop:${serviceId}`);

  return (
    <article
      className="relative flex min-h-[310px] min-w-0 flex-col overflow-hidden rounded-[20px] border border-line bg-white p-5 shadow-[0_5px_18px_rgba(22,50,79,0.045)]"
      id={`service-${serviceId}`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 h-[3px] ${serviceAccent(status, service.ownership)}`}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-[13px] bg-soft text-brand-deep">
            <Icon className="size-5.5" name={meta.icon} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-[760] tracking-[-0.01em] text-ink">
              {meta.title}
            </h2>
            <p className="mt-0.5 font-mono text-[9px] text-muted">
              port {service.port ?? meta.fallbackPort}
            </p>
          </div>
        </div>
        <StatusBadge service={service} />
      </div>

      <p
        className={`mt-5 text-[12px] leading-5 ${service.lastError ? "text-danger" : "text-muted"}`}
      >
        {service.lastError || meta.description}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-[#f7f9f8] px-2.5 py-1.5 text-[9px] font-bold text-muted">
          {protectedProcess ? <Icon className="size-3" name="lock" /> : null}
          {ownershipLabel(service.ownership)}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {primaryUrl && serviceId !== "iphoneMetro" ? (
          <LocalLink
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-deep hover:underline"
            href={primaryUrl}
            label={`Åbn ${meta.title} i en ny fane`}
          >
            Åbn {serviceId === "supabase" ? "Studio" : "preview"}
            <Icon className="size-3.5" name="external" />
          </LocalLink>
        ) : null}
        {serviceId === "supabase" ? (
          <LocalLink
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-deep hover:underline"
            href="http://localhost:54324"
            label="Åbn testmails i en ny fane"
          >
            Testmails <Icon className="size-3.5" name="external" />
          </LocalLink>
        ) : null}
        {serviceId === "iphoneMetro" &&
        (status === "running" || status === "external") ? (
          <span className="text-[11px] font-bold text-brand-deep">
            Åbn Bare Træn Dev på din iPhone
          </span>
        ) : null}
      </div>

      {protectedProcess ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#e4d5ad] bg-soft-warm p-3 text-[#765d1f]">
          <Icon className="mt-0.5 size-4 shrink-0" name="shield" />
          <p className="text-[10px] leading-4">
            Panelet kan ikke bevise, at processen tilhører Bare Træn, og stopper
            den derfor ikke.
          </p>
        </div>
      ) : null}

      <div className="mt-auto flex items-center gap-2 pt-5">
        {canStart ? (
          <Button
            aria-busy={pending.has(`start:${serviceId}`)}
            disabled={actionPending}
            icon="play"
            onClick={() => void runServiceAction("start", serviceId)}
            variant="primary"
          >
            Start
          </Button>
        ) : null}
        {canStop ? (
          <Button
            aria-busy={pending.has(`stop:${serviceId}`)}
            disabled={actionPending}
            icon="stop"
            onClick={() => void runServiceAction("stop", serviceId)}
          >
            Stop
          </Button>
        ) : null}
        {transition ? (
          <Button disabled icon={status === "starting" ? "play" : "stop"}>
            {STATUS_META[status].label}
          </Button>
        ) : null}
        <Button
          className="ml-auto"
          icon="logs"
          onClick={() => showLogs(serviceId)}
          variant="quiet"
        >
          Log
        </Button>
      </div>
    </article>
  );
}

function ServicesPage({
  snapshot,
  pendingActions,
  runAggregateAction,
  runServiceAction,
  refresh,
  refreshing,
  showLogs,
}: {
  snapshot: ConsoleSnapshot | null;
  pendingActions: Set<string>;
  runAggregateAction: (action: AggregateAction) => Promise<void>;
  runServiceAction: (
    action: ServiceAction,
    serviceId: ServiceId,
  ) => Promise<void>;
  refresh: (manual?: boolean) => Promise<void>;
  refreshing: boolean;
  showLogs: (serviceId: ServiceId) => void;
}) {
  return (
    <div>
      <header className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
        <div>
          <p className="mb-2 text-[10px] font-extrabold tracking-[0.14em] text-brand uppercase">
            Det lokale miljø
          </p>
          <h1
            className="text-[clamp(2.3rem,5vw,4rem)] leading-none font-[640] tracking-[-0.048em] text-ink outline-none"
            data-page-heading
            tabIndex={-1}
          >
            Tjenester
          </h1>
          <p className="mt-4 max-w-2xl text-[14px] leading-6 text-muted">
            Se, hvad der kører, åbn previews, og start eller stop kun de
            processer, der sikkert tilhører Bare Træn.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!snapshot || pendingActions.has("start-local-web")}
            icon="play"
            onClick={() => void runAggregateAction("start-local-web")}
            variant="primary"
          >
            Start tjenester
          </Button>
          <Button
            disabled={!snapshot || pendingActions.has("stop-my-apps")}
            icon="stop"
            onClick={() => void runAggregateAction("stop-my-apps")}
          >
            Stop tjenester
          </Button>
          <Button
            aria-label="Opdatér status"
            disabled={refreshing}
            icon="refresh"
            onClick={() => void refresh(true)}
            variant="quiet"
          >
            Opdatér
          </Button>
        </div>
      </header>

      <section className="mt-10" aria-label="Lokale tjenester">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {SERVICE_ORDER.map((serviceId) => {
            const service = snapshot?.services[serviceId];
            return service ? (
              <ServiceCard
                key={serviceId}
                pending={pendingActions}
                runServiceAction={runServiceAction}
                service={service}
                serviceId={serviceId}
                showLogs={showLogs}
              />
            ) : (
              <EmptyServiceCard key={serviceId} serviceId={serviceId} />
            );
          })}
        </div>
      </section>

      <section className="mt-8 rounded-[20px] border border-[#cde6df] bg-[#effaf6] p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#d9f2e8] text-[#26754f]">
            <Icon className="size-5" name="shield" />
          </span>
          <div>
            <h2 className="text-[14px] font-[750] text-[#245c47]">
              Panelet stopper sikkert
            </h2>
            <p className="mt-1 max-w-3xl text-[12px] leading-5 text-[#45705e]">
              En proces, som panelet ikke kan genkende, markeres som beskyttet.
              Den kan ses, men aldrig stoppes herfra. Supabase-stop gælder kun
              denne repositorys lokale Docker-stack.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function EvidenceImagePreview({
  evidence,
  compact = false,
}: {
  evidence: Extract<TaskEvidence, { kind: "image" }>;
  compact?: boolean;
}) {
  const [missing, setMissing] = useState(false);
  const source = evidenceImageUrl(evidence.path);

  if (!source || missing) {
    return (
      <span
        className={`grid place-items-center rounded-lg border border-dashed border-line-strong bg-[#f8f8f5] px-2 text-center text-muted ${
          compact ? "h-14 text-[8px]" : "h-24 text-[10px]"
        }`}
        role="status"
      >
        Bevis mangler
      </span>
    );
  }

  return (
    <a
      aria-label={`Åbn billedbevis: ${evidence.label}`}
      className="block overflow-hidden rounded-lg border border-line bg-white transition hover:border-line-strong"
      href={source}
      rel="noopener noreferrer"
      target="_blank"
    >
      <img
        alt={evidence.label}
        className={`w-full object-cover ${compact ? "h-14" : "h-24"}`}
        loading="lazy"
        onError={() => setMissing(true)}
        src={source}
      />
    </a>
  );
}

function TaskImplementationSummary({ task }: { task: ConsoleTask }) {
  const hasNotes = task.implementationNotes.length > 0;
  const visibleEvidence = task.evidence.slice(0, 2);
  if (!hasNotes && task.evidence.length === 0) {
    return task.status === "done" ? (
      <p className="mt-3 rounded-lg border border-dashed border-line px-2.5 py-2 text-[8px] leading-3.5 text-muted">
        Implementeringsbevis er ikke tilføjet endnu.
      </p>
    ) : null;
  }

  return (
    <section
      aria-label={`Implementering og bevis for ${task.title}`}
      className="mt-3 rounded-[11px] border border-[#d8e8e3] bg-[#f4faf7] p-2.5"
    >
      {hasNotes ? (
        <div>
          <p className="inline-flex items-center gap-1.5 text-[8px] font-extrabold tracking-[0.08em] text-[#2c6d55] uppercase">
            <Icon className="size-3" name="check" />
            Implementering
          </p>
          <p className="mt-1 line-clamp-3 text-[9px] leading-3.5 text-[#49665b]">
            {task.implementationNotes}
          </p>
        </div>
      ) : null}
      {visibleEvidence.length > 0 ? (
        <div className={`${hasNotes ? "mt-2.5" : ""}`}>
          <p className="mb-1.5 text-[8px] font-extrabold tracking-[0.08em] text-[#2c6d55] uppercase">
            {task.evidence.length}{" "}
            {task.evidence.length === 1 ? "bevis" : "beviser"}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {visibleEvidence.map((evidence) =>
              evidence.kind === "image" ? (
                <EvidenceImagePreview
                  compact
                  evidence={evidence}
                  key={`image:${evidence.path}`}
                />
              ) : safeEvidenceLink(evidence.url) ? (
                <a
                  className="flex h-14 min-w-0 flex-col justify-between rounded-lg border border-line bg-white p-2 text-[8px] font-bold text-brand-deep no-underline transition hover:border-line-strong"
                  href={evidence.url}
                  key={`link:${evidence.url}`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <span className="line-clamp-2">{evidence.label}</span>
                  <span className="inline-flex items-center gap-1 text-[7px] text-muted">
                    <Icon className="size-2.5" name="external" /> Åbn link
                  </span>
                </a>
              ) : (
                <span
                  className="grid h-14 place-items-center rounded-lg border border-dashed border-line-strong px-2 text-center text-[8px] text-muted"
                  key={`invalid:${evidence.url}`}
                >
                  Ugyldigt link
                </span>
              ),
            )}
          </div>
          {task.evidence.length > visibleEvidence.length ? (
            <p className="mt-1.5 text-right text-[8px] font-bold text-muted">
              +{task.evidence.length - visibleEvidence.length} flere
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function TaskCard({
  task,
  columnTasks,
  index,
  pending,
  draggedTaskId,
  dropTarget,
  editTask,
  reorderTask,
  setDraggedTaskId,
  setDropTarget,
  finishDrop,
}: {
  task: ConsoleTask;
  columnTasks: ConsoleTask[];
  index: number;
  pending: boolean;
  draggedTaskId: string | null;
  dropTarget: TaskDropTarget | null;
  editTask: (task: ConsoleTask) => void;
  reorderTask: (
    taskId: string,
    status: TaskStatus,
    beforeTaskId: string | null,
  ) => Promise<void>;
  setDraggedTaskId: (taskId: string | null) => void;
  setDropTarget: (target: TaskDropTarget | null) => void;
  finishDrop: (status: TaskStatus, beforeTaskId: string | null) => void;
}) {
  const canMoveUp = index > 0 && !pending;
  const canMoveDown = index < columnTasks.length - 1 && !pending;
  const isDragged = draggedTaskId === task.id;
  const isDropTarget =
    draggedTaskId !== null &&
    draggedTaskId !== task.id &&
    dropTarget?.status === task.status &&
    dropTarget.beforeTaskId === task.id;

  const startDrag = (event: ReactDragEvent<HTMLButtonElement>) => {
    if (pending) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
    setDraggedTaskId(task.id);
  };

  const moveUp = () => {
    const previousTask = columnTasks[index - 1];
    if (previousTask) void reorderTask(task.id, task.status, previousTask.id);
  };

  const moveDown = () => {
    const taskAfterNext = columnTasks[index + 2];
    void reorderTask(task.id, task.status, taskAfterNext?.id ?? null);
  };

  return (
    <article
      className={`relative rounded-[14px] border bg-white p-3.5 shadow-[0_3px_10px_rgba(22,50,79,0.045)] transition ${
        isDropTarget ? "border-brand ring-2 ring-brand/20" : "border-line"
      } ${isDragged ? "opacity-45" : "opacity-100"}`}
      data-task-id={task.id}
      onDragOver={(event) => {
        if (!draggedTaskId || draggedTaskId === task.id) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        setDropTarget({ status: task.status, beforeTaskId: task.id });
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (draggedTaskId) finishDrop(task.status, task.id);
      }}
    >
      {isDropTarget ? (
        <span
          aria-hidden="true"
          className="absolute -top-1.5 right-2 left-2 h-1 rounded-full bg-brand"
        />
      ) : null}
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 text-[12px] leading-[1.4] font-[750] text-ink">
          {task.title}
        </h3>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            aria-label={`Træk ${task.title} for at flytte opgaven`}
            className="inline-flex min-h-8 cursor-grab items-center gap-1 rounded-lg border-0 bg-transparent px-1.5 text-[8px] font-bold text-muted transition hover:bg-soft hover:text-brand-deep active:cursor-grabbing disabled:cursor-wait disabled:opacity-50"
            disabled={pending}
            draggable={!pending}
            onDragEnd={() => {
              setDraggedTaskId(null);
              setDropTarget(null);
            }}
            onDragStart={startDrag}
            title="Træk for at ændre rækkefølge"
            type="button"
          >
            <Icon className="size-3.5" name="logs" />
            Træk
          </button>
          <button
            aria-label={`Redigér ${task.title}`}
            className="grid size-8 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-brand-deep transition hover:bg-soft"
            onClick={() => editTask(task)}
            type="button"
          >
            <Icon className="size-3.5" name="edit" />
          </button>
        </div>
      </div>
      {task.details ? (
        <p className="mt-2 line-clamp-4 text-[10px] leading-4 text-muted">
          {task.details}
        </p>
      ) : null}

      <TaskImplementationSummary task={task} />

      <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
        <span className="rounded-full bg-soft px-2 py-1 text-[8px] font-extrabold text-brand-deep">
          Prioritet {task.priority + 1}
        </span>
        <span className="text-right text-[8px] leading-3 text-muted">
          Opdateret {formatShortDate(task.updatedAt)}
        </span>
      </div>

      <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <label className="min-w-0">
          <span className="mb-1 block text-[8px] font-extrabold tracking-[0.08em] text-muted uppercase">
            Status
          </span>
          <select
            aria-label={`Status for ${task.title}`}
            className="min-h-8 w-full rounded-lg border border-line bg-[#fbfcfb] px-2 py-1 text-[10px] font-bold text-ink disabled:cursor-wait disabled:opacity-60"
            disabled={pending}
            onChange={(event) =>
              void reorderTask(task.id, event.target.value as TaskStatus, null)
            }
            value={task.status}
          >
            {TASK_COLUMNS.map((column) => (
              <option key={column.status} value={column.status}>
                {column.label}
              </option>
            ))}
          </select>
        </label>
        <div
          className="flex items-center gap-1"
          aria-label={`Flyt ${task.title} i kolonnen`}
        >
          <button
            aria-label={`Flyt ${task.title} op`}
            className="grid size-8 cursor-pointer place-items-center rounded-lg border border-line bg-white text-muted transition hover:border-line-strong hover:text-brand-deep disabled:cursor-not-allowed disabled:opacity-35"
            disabled={!canMoveUp}
            onClick={moveUp}
            title="Flyt én plads op"
            type="button"
          >
            <Icon className="size-3.5 -rotate-90" name="chevron" />
          </button>
          <button
            aria-label={`Flyt ${task.title} ned`}
            className="grid size-8 cursor-pointer place-items-center rounded-lg border border-line bg-white text-muted transition hover:border-line-strong hover:text-brand-deep disabled:cursor-not-allowed disabled:opacity-35"
            disabled={!canMoveDown}
            onClick={moveDown}
            title="Flyt én plads ned"
            type="button"
          >
            <Icon className="size-3.5 rotate-90" name="chevron" />
          </button>
        </div>
      </div>
    </article>
  );
}

function TasksPage({
  snapshot,
  pendingTasks,
  reorderTask,
  openTaskDialog,
}: {
  snapshot: ConsoleSnapshot | null;
  pendingTasks: Set<string>;
  reorderTask: (
    taskId: string,
    status: TaskStatus,
    beforeTaskId: string | null,
  ) => Promise<void>;
  openTaskDialog: (state: TaskDialogState) => void;
}) {
  const [hideDone, setHideDone] = usePersistedSetting<boolean>(
    HIDE_DONE_STORAGE_KEY,
    false,
    (value): value is boolean => typeof value === "boolean",
  );
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<TaskDropTarget | null>(null);

  const tasks = useMemo(
    () =>
      normalizeTasks(snapshot?.tasks.items ?? []).sort(
        (left, right) => left.priority - right.priority,
      ),
    [snapshot?.tasks.items],
  );

  const visibleColumns = hideDone
    ? TASK_COLUMNS.filter((column) => column.status !== "done")
    : TASK_COLUMNS;

  const finishDrop = (status: TaskStatus, beforeTaskId: string | null) => {
    const draggedTask = tasks.find((task) => task.id === draggedTaskId);
    setDraggedTaskId(null);
    setDropTarget(null);
    if (!draggedTask || draggedTask.id === beforeTaskId) return;

    const currentColumn = tasks.filter(
      (task) => task.status === draggedTask.status,
    );
    const currentIndex = currentColumn.findIndex(
      (task) => task.id === draggedTask.id,
    );
    const currentNextId = currentColumn[currentIndex + 1]?.id ?? null;
    if (draggedTask.status === status && currentNextId === beforeTaskId) return;

    void reorderTask(draggedTask.id, status, beforeTaskId);
  };

  return (
    <div>
      <header className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
        <div>
          <p className="mb-2 text-[10px] font-extrabold tracking-[0.14em] text-brand uppercase">
            Fælles arbejdsplan
          </p>
          <h1
            className="text-[clamp(2.3rem,5vw,4rem)] leading-none font-[640] tracking-[-0.048em] text-ink outline-none"
            data-page-heading
            tabIndex={-1}
          >
            Opgaver
          </h1>
          <p className="mt-4 max-w-2xl text-[14px] leading-6 text-muted">
            Træk kortene eller brug pilene. Rækkefølgen og status gemmes i den
            lokale opgaveliste med det samme.
          </p>
        </div>
        <Button
          icon="plus"
          onClick={() => openTaskDialog({ mode: "create" })}
          size="large"
          variant="primary"
        >
          Ny opgave
        </Button>
      </header>

      <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-line bg-[#f9f8f3] p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <p className="inline-flex items-center gap-2 text-[10px] leading-4 text-muted">
          <Icon className="size-4 shrink-0 text-brand" name="logs" />
          Lavere prioritetstal vises først. Brug Træk eller pilene for at ændre
          rækkefølgen.
        </p>
        <label className="inline-flex cursor-pointer items-center gap-2.5 text-[11px] font-bold text-ink">
          <input
            checked={hideDone}
            className="size-4 rounded border-line-strong accent-brand"
            onChange={(event) => setHideDone(event.target.checked)}
            type="checkbox"
          />
          Skjul Done
        </label>
      </div>

      <p className="sr-only" aria-live="polite">
        {draggedTaskId
          ? `Flytter ${tasks.find((task) => task.id === draggedTaskId)?.title ?? "opgave"}. Slip over et kort eller nederst i en kolonne.`
          : ""}
      </p>

      <section
        aria-label="Kanban-opgavetavle"
        className={`mt-5 grid auto-cols-[minmax(290px,84vw)] grid-flow-col gap-3 overflow-x-auto pb-4 xl:auto-cols-auto xl:grid-flow-row ${hideDone ? "xl:grid-cols-3" : "xl:grid-cols-4"}`}
      >
        {visibleColumns.map((column) => {
          const columnTasks = tasks.filter(
            (task) => task.status === column.status,
          );
          const appendTarget =
            draggedTaskId !== null &&
            dropTarget?.status === column.status &&
            dropTarget.beforeTaskId === null;
          return (
            <section
              aria-labelledby={`task-column-${column.status}`}
              className={`min-h-[430px] rounded-[18px] border p-3 transition ${
                appendTarget
                  ? "border-brand ring-2 ring-brand/15"
                  : "border-line"
              } ${
                column.status === "doing"
                  ? "bg-soft"
                  : column.status === "done"
                    ? "bg-[#f4f7f4]"
                    : "bg-[#f7f7f3]"
              }`}
              id={column.status}
              key={column.status}
              onDragOver={(event) => {
                if (!draggedTaskId) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropTarget({ status: column.status, beforeTaskId: null });
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (draggedTaskId) finishDrop(column.status, null);
              }}
            >
              <header className="mb-3 flex items-start justify-between gap-2 px-0.5">
                <div>
                  <h2
                    className="text-[12px] font-extrabold text-ink"
                    id={`task-column-${column.status}`}
                  >
                    {column.label}
                  </h2>
                  <p className="mt-0.5 text-[9px] leading-3.5 text-muted">
                    {column.shortDescription}
                  </p>
                </div>
                <span
                  aria-label={`${columnTasks.length} ${columnTasks.length === 1 ? "opgave" : "opgaver"}`}
                  className="grid min-w-6 place-items-center rounded-full border border-line bg-white px-1.5 py-1 text-[9px] font-extrabold text-muted"
                >
                  {snapshot ? columnTasks.length : "—"}
                </span>
              </header>
              <div className="grid gap-2.5">
                {!snapshot ? (
                  <div className="h-24 animate-pulse rounded-[14px] bg-[#e9edec]" />
                ) : columnTasks.length ? (
                  columnTasks.map((task, index) => (
                    <TaskCard
                      columnTasks={columnTasks}
                      draggedTaskId={draggedTaskId}
                      dropTarget={dropTarget}
                      editTask={(selectedTask) =>
                        openTaskDialog({ mode: "edit", task: selectedTask })
                      }
                      finishDrop={finishDrop}
                      index={index}
                      key={task.id}
                      pending={pendingTasks.has(task.id)}
                      reorderTask={reorderTask}
                      setDraggedTaskId={setDraggedTaskId}
                      setDropTarget={setDropTarget}
                      task={task}
                    />
                  ))
                ) : !draggedTaskId ? (
                  <p className="grid min-h-24 place-items-center rounded-[13px] border border-dashed border-line-strong p-4 text-center text-[10px] text-muted">
                    Ingen opgaver her endnu.
                  </p>
                ) : null}
                {draggedTaskId ? (
                  <div
                    className={`grid min-h-14 place-items-center rounded-[12px] border border-dashed px-3 text-center text-[9px] font-bold transition ${
                      appendTarget
                        ? "border-brand bg-white text-brand-deep"
                        : "border-line-strong text-muted"
                    }`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      event.dataTransfer.dropEffect = "move";
                      setDropTarget({
                        status: column.status,
                        beforeTaskId: null,
                      });
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      finishDrop(column.status, null);
                    }}
                  >
                    Slip her nederst i {column.label}
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}
      </section>
    </div>
  );
}

function LogDialog({
  serviceId,
  snapshot,
  onClose,
}: {
  serviceId: ServiceId | null;
  snapshot: ConsoleSnapshot | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLPreElement>(null);
  const service = serviceId ? snapshot?.services[serviceId] : null;
  const entries = serviceId ? (snapshot?.logs[serviceId] ?? []) : [];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (serviceId && !dialog.open) dialog.showModal();
    if (!serviceId && dialog.open) dialog.close();
  }, [serviceId]);

  useEffect(() => {
    if (contentRef.current)
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
  }, [entries.length]);

  const title = serviceId ? SERVICE_META[serviceId].title : "Tjeneste";

  return (
    <dialog
      aria-labelledby="log-dialog-title"
      className="m-auto max-h-[80vh] w-[min(760px,calc(100%-28px))] max-w-none overflow-hidden rounded-[22px] border border-line-strong bg-paper p-0 text-ink shadow-panel"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      ref={dialogRef}
    >
      <div className="flex max-h-[80vh] flex-col">
        <header className="flex items-center justify-between gap-5 border-b border-line px-5 py-4">
          <div>
            <p className="mb-1 text-[9px] font-extrabold tracking-[0.13em] text-brand uppercase">
              Seneste aktivitet
            </p>
            <h2
              className="text-xl font-[650] tracking-[-0.025em]"
              id="log-dialog-title"
            >
              {title} · log
            </h2>
          </div>
          <Button
            aria-label="Luk log"
            icon="close"
            onClick={onClose}
            variant="quiet"
          >
            <span className="sr-only">Luk</span>
          </Button>
        </header>
        <p className="border-b border-[#2c4557] bg-[#173147] px-5 py-2.5 text-[10px] text-[#c7d8e4]">
          {service ? serviceStatusLabel(service) : "Ukendt status"} ·{" "}
          {entries.length} seneste linjer
        </p>
        <pre
          className="m-0 min-h-[300px] overflow-auto bg-[#102638] px-5 py-4 font-mono text-[11px] leading-5 whitespace-pre-wrap text-[#e9f2f7]"
          ref={contentRef}
          tabIndex={0}
        >
          {entries.length
            ? entries.map(formatLogEntry).join("\n")
            : "Der er endnu ikke skrevet noget i loggen."}
        </pre>
      </div>
    </dialog>
  );
}

function TaskDialog({
  state,
  saving,
  onClose,
  onDelete,
  onSave,
}: {
  state: TaskDialogState;
  saving: boolean;
  onClose: () => void;
  onDelete: (task: ConsoleTask) => Promise<boolean>;
  onSave: (draft: TaskDraft, taskId?: string) => Promise<boolean>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<TaskDraft>(() =>
    state.mode === "edit" && state.task
      ? {
          title: state.task.title,
          details: state.task.details,
          implementationNotes: state.task.implementationNotes,
          evidence: state.task.evidence,
          status: normalizeTaskStatus(state.task.status),
        }
      : {
          title: "",
          details: "",
          implementationNotes: "",
          evidence: [],
          status: "backlog",
        },
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const frame = requestAnimationFrame(() => titleRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      if (dialog.open) dialog.close();
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedDraft = {
      ...draft,
      title: draft.title.trim(),
      details: draft.details.trim(),
      implementationNotes: draft.implementationNotes.trim(),
      evidence: draft.evidence.map((evidence) =>
        evidence.kind === "image"
          ? {
              kind: "image" as const,
              label: evidence.label.trim(),
              path: evidence.path.trim(),
            }
          : {
              kind: "link" as const,
              label: evidence.label.trim(),
              url: evidence.url.trim(),
            },
      ),
    };
    if (!normalizedDraft.title) {
      titleRef.current?.focus();
      return;
    }
    const saved = await onSave(
      normalizedDraft,
      state?.mode === "edit" ? state.task?.id : undefined,
    );
    if (saved) onClose();
  }

  const editingTask = state?.mode === "edit" ? state.task : undefined;

  return (
    <dialog
      aria-labelledby="task-dialog-title"
      className="m-auto max-h-[calc(100vh-28px)] w-[min(720px,calc(100%-28px))] max-w-none overflow-hidden rounded-[22px] border border-line-strong bg-paper p-0 text-ink shadow-panel"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
      onClick={(event) => {
        if (event.currentTarget === event.target && !saving) onClose();
      }}
      ref={dialogRef}
    >
      <form
        className="flex max-h-[calc(100vh-28px)] flex-col"
        onSubmit={(event) => void submit(event)}
      >
        <header className="flex items-center justify-between gap-5 border-b border-line px-5 py-4">
          <div>
            <p className="mb-1 text-[9px] font-extrabold tracking-[0.13em] text-brand uppercase">
              Opgavetavlen
            </p>
            <h2
              className="text-xl font-[650] tracking-[-0.025em]"
              id="task-dialog-title"
            >
              {editingTask ? "Redigér opgave" : "Ny opgave"}
            </h2>
          </div>
          <Button
            aria-label="Luk opgave"
            disabled={saving}
            icon="close"
            onClick={onClose}
            variant="quiet"
          >
            <span className="sr-only">Luk</span>
          </Button>
        </header>

        <div className="grid gap-5 overflow-y-auto p-5">
          <section
            aria-labelledby="task-basics-heading"
            className="grid gap-4.5"
          >
            <div>
              <h3
                className="text-[11px] font-extrabold tracking-[0.08em] text-brand uppercase"
                id="task-basics-heading"
              >
                Opgaven
              </h3>
              <p className="mt-1 text-[10px] leading-4 text-muted">
                Beskriv hvad der skal laves, og hvor opgaven hører til.
              </p>
            </div>
            <label className="grid gap-1.5 text-[11px] font-[750] text-ink">
              Titel
              <input
                className="min-h-11 w-full rounded-xl border border-line-strong bg-white px-3 py-2 text-[13px] font-medium disabled:opacity-60"
                disabled={saving}
                maxLength={160}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                ref={titleRef}
                required
                value={draft.title}
              />
            </label>
            <label className="grid gap-1.5 text-[11px] font-[750] text-ink">
              <span>
                Opgavebeskrivelse{" "}
                <small className="font-medium text-muted">valgfri</small>
              </span>
              <textarea
                className="min-h-28 w-full resize-y rounded-xl border border-line-strong bg-white px-3 py-2.5 text-[13px] leading-5 font-medium disabled:opacity-60"
                disabled={saving}
                maxLength={4000}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    details: event.target.value,
                  }))
                }
                rows={4}
                value={draft.details}
              />
            </label>
            <label className="grid gap-1.5 text-[11px] font-[750] text-ink">
              Status
              <select
                className="min-h-11 w-full rounded-xl border border-line-strong bg-white px-3 py-2 text-[13px] font-semibold disabled:opacity-60"
                disabled={saving}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    status: event.target.value as TaskStatus,
                  }))
                }
                value={draft.status}
              >
                {TASK_COLUMNS.map((column) => (
                  <option key={column.status} value={column.status}>
                    {column.label}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section
            aria-labelledby="task-implementation-heading"
            className="grid gap-3 rounded-2xl border border-[#cfe3dc] bg-[#f5faf7] p-4"
          >
            <div>
              <h3
                className="text-[11px] font-extrabold tracking-[0.08em] text-[#2c6d55] uppercase"
                id="task-implementation-heading"
              >
                Sådan blev den implementeret
              </h3>
              <p className="mt-1 text-[10px] leading-4 text-[#597068]">
                Skriv kort hvad der blev ændret, og hvordan resultatet blev
                kontrolleret. Tilføj aldrig adgangskoder, API-nøgler,
                engangskoder eller rigtige børnedata.
              </p>
            </div>
            <label className="grid gap-1.5 text-[11px] font-[750] text-ink">
              <span>
                Implementeringsnote{" "}
                <small className="font-medium text-muted">valgfri</small>
              </span>
              <textarea
                className="min-h-28 w-full resize-y rounded-xl border border-line-strong bg-white px-3 py-2.5 text-[13px] leading-5 font-medium disabled:opacity-60"
                disabled={saving}
                maxLength={4000}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    implementationNotes: event.target.value,
                  }))
                }
                placeholder="Eksempel: Login-flowet bruger nu email-OTP, og fejltilstanden er testet lokalt."
                rows={4}
                value={draft.implementationNotes}
              />
            </label>
          </section>

          <section
            aria-labelledby="task-evidence-heading"
            className="grid gap-3 rounded-2xl border border-line bg-[#faf9f5] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3
                  className="text-[11px] font-extrabold tracking-[0.08em] text-brand uppercase"
                  id="task-evidence-heading"
                >
                  Bevis
                </h3>
                <p className="mt-1 max-w-lg text-[10px] leading-4 text-muted">
                  Brug et HTTPS-link eller en sikker skærmbilledsti fra mappen{" "}
                  <code>tools/dev-console/evidence</code>. Flere beviser er
                  tilladt.
                </p>
              </div>
              <Button
                disabled={saving || draft.evidence.length >= 10}
                icon="plus"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    evidence: [
                      ...current.evidence,
                      { kind: "link", label: "", url: "" },
                    ],
                  }))
                }
                size="small"
              >
                Tilføj bevis
              </Button>
            </div>

            {draft.evidence.length ? (
              <div className="grid gap-3">
                {draft.evidence.map((evidence, index) => (
                  <fieldset
                    className="grid gap-3 rounded-xl border border-line bg-white p-3"
                    disabled={saving}
                    key={index}
                  >
                    <legend className="px-1 text-[9px] font-extrabold text-muted uppercase">
                      Bevis {index + 1}
                    </legend>
                    <div className="grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-end">
                      <label className="grid gap-1 text-[10px] font-bold text-ink">
                        Type
                        <select
                          className="min-h-10 rounded-lg border border-line-strong bg-white px-2.5 py-2 text-[11px] font-semibold"
                          onChange={(event) => {
                            const kind = event.target.value;
                            setDraft((current) => ({
                              ...current,
                              evidence: current.evidence.map(
                                (item, itemIndex) =>
                                  itemIndex !== index
                                    ? item
                                    : kind === "image"
                                      ? {
                                          kind: "image",
                                          label: item.label,
                                          path: "",
                                        }
                                      : {
                                          kind: "link",
                                          label: item.label,
                                          url: "",
                                        },
                              ),
                            }));
                          }}
                          value={evidence.kind}
                        >
                          <option value="link">HTTPS-link</option>
                          <option value="image">Skærmbillede</option>
                        </select>
                      </label>
                      <label className="grid gap-1 text-[10px] font-bold text-ink">
                        Kort navn
                        <input
                          className="min-h-10 rounded-lg border border-line-strong bg-white px-2.5 py-2 text-[11px] font-medium"
                          maxLength={120}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              evidence: current.evidence.map(
                                (item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, label: event.target.value }
                                    : item,
                              ),
                            }))
                          }
                          placeholder="Fx Admin-login med kode"
                          required
                          value={evidence.label}
                        />
                      </label>
                      <Button
                        aria-label={`Fjern bevis ${index + 1}`}
                        icon="trash"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            evidence: current.evidence.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          }))
                        }
                        size="small"
                        variant="quiet"
                      >
                        Fjern
                      </Button>
                    </div>
                    {evidence.kind === "image" ? (
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-end">
                        <label className="grid gap-1 text-[10px] font-bold text-ink">
                          Sti under evidence-mappen
                          <input
                            autoCapitalize="none"
                            autoCorrect="off"
                            className="min-h-10 rounded-lg border border-line-strong bg-white px-2.5 py-2 font-mono text-[10px]"
                            maxLength={220}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                evidence: current.evidence.map(
                                  (item, itemIndex) =>
                                    itemIndex === index && item.kind === "image"
                                      ? { ...item, path: event.target.value }
                                      : item,
                                ),
                              }))
                            }
                            placeholder="opgave-id/2026-08-20-login.png"
                            required
                            spellCheck={false}
                            value={evidence.path}
                          />
                        </label>
                        {evidence.path ? (
                          <EvidenceImagePreview
                            evidence={evidence}
                            key={evidence.path}
                          />
                        ) : (
                          <span className="grid h-24 place-items-center rounded-lg border border-dashed border-line-strong px-2 text-center text-[9px] text-muted">
                            Forhåndsvisning vises her
                          </span>
                        )}
                      </div>
                    ) : (
                      <label className="grid gap-1 text-[10px] font-bold text-ink">
                        HTTPS-link uden hemmelige parametre
                        <input
                          autoCapitalize="none"
                          autoCorrect="off"
                          className="min-h-10 rounded-lg border border-line-strong bg-white px-2.5 py-2 text-[11px] font-medium"
                          maxLength={1000}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              evidence: current.evidence.map(
                                (item, itemIndex) =>
                                  itemIndex === index && item.kind === "link"
                                    ? { ...item, url: event.target.value }
                                    : item,
                              ),
                            }))
                          }
                          placeholder="https://github.com/..."
                          required
                          type="url"
                          value={evidence.url}
                        />
                      </label>
                    )}
                  </fieldset>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-line-strong px-3 py-4 text-center text-[10px] text-muted">
                Intet bevis endnu. Opgaven kan stadig gemmes og flyttes.
              </p>
            )}
          </section>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-line bg-[#faf9f5] px-5 py-4">
          {editingTask ? (
            <Button
              disabled={saving}
              icon="trash"
              onClick={() =>
                void onDelete(editingTask).then(
                  (deleted) => deleted && onClose(),
                )
              }
              variant="danger"
            >
              Slet
            </Button>
          ) : null}
          <span className="flex-1" />
          <Button disabled={saving} onClick={onClose}>
            Annullér
          </Button>
          <Button
            aria-busy={saving}
            disabled={saving}
            icon={saving ? undefined : "check"}
            type="submit"
            variant="primary"
          >
            {saving ? "Gemmer…" : "Gem opgave"}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}

function GitPanel({ snapshot }: { snapshot: ConsoleSnapshot | null }) {
  const git = snapshot?.git;
  if (!git) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-5 py-3 text-[9px] text-muted sm:px-7">
      <span className="inline-flex items-center gap-1.5 font-bold text-ink">
        <Icon className="size-3.5 text-brand" name="branch" />
        {git.branch || "ukendt gren"}
      </span>
      <span
        className={`rounded-full px-2 py-1 font-bold ${
          git.clean
            ? "bg-[#e7f6ec] text-[#23764c]"
            : "bg-[#fff5d8] text-[#765d1f]"
        }`}
      >
        {git.clean
          ? "Ingen ændringer"
          : `${git.changedCount ?? "Nogle"} ikke-committede ${git.changedCount === 1 ? "fil" : "filer"}`}
      </span>
    </div>
  );
}

function NotFoundPage({ navigate }: { navigate: (to: string) => void }) {
  return (
    <div className="grid min-h-[55vh] place-items-center text-center">
      <div>
        <p className="text-[10px] font-extrabold tracking-[0.14em] text-brand uppercase">
          404
        </p>
        <h1
          className="mt-2 text-4xl font-[640] tracking-[-0.04em] text-ink outline-none"
          data-page-heading
          tabIndex={-1}
        >
          Siden findes ikke
        </h1>
        <p className="mt-3 text-[13px] text-muted">
          Kontrolpanelet har kun tre lokale sider.
        </p>
        <RouteLink
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[12px] font-bold text-white"
          navigate={navigate}
          to="/"
        >
          <Icon className="size-4" name="home" /> Til overblikket
        </RouteLink>
      </div>
    </div>
  );
}

function usePersistedSetting<T>(
  key: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored === null) return fallback;
      const parsed: unknown = JSON.parse(stored);
      return isValid(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  });

  const update = useCallback(
    (nextValue: T) => {
      setValue(nextValue);
      try {
        window.localStorage.setItem(key, JSON.stringify(nextValue));
      } catch {
        // The setting still works for this tab when storage is unavailable.
      }
    },
    [key],
  );

  return [value, update];
}

export function App() {
  const [route, setRoute] = useState<RoutePath>(currentRoute);
  const [snapshot, setSnapshot] = useState<ConsoleSnapshot | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());
  const [pendingTasks, setPendingTasks] = useState<Set<string>>(new Set());
  const [selectedLog, setSelectedLog] = useState<ServiceId | null>(null);
  const [taskDialog, setTaskDialog] = useState<TaskDialogState | null>(null);
  const [taskSaving, setTaskSaving] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const fetchInFlight = useRef(false);
  const backendRefreshInFlight = useRef(false);
  const mutationInFlight = useRef(0);
  const refreshGeneration = useRef(0);
  const csrfToken = useRef("");
  const toastId = useRef(0);
  const previousIphonePreviewStatus = useRef<string | null>(null);

  const pushToast = useCallback(
    (message: string, kind: ToastKind = "success") => {
      const id = ++toastId.current;
      setToasts((current) => [...current, { id, kind, message }]);
      window.setTimeout(
        () =>
          setToasts((current) => current.filter((toast) => toast.id !== id)),
        kind === "error" ? 7_000 : 4_000,
      );
    },
    [],
  );

  useEffect(() => {
    const nextStatus = snapshot?.iphonePreview?.status ?? null;
    const previousStatus = previousIphonePreviewStatus.current;
    previousIphonePreviewStatus.current = nextStatus;
    if (
      nextStatus === "ready" &&
      (previousStatus === "queued" || previousStatus === "building")
    ) {
      pushToast("iPhone-previewet er klar til installation.");
    }
  }, [pushToast, snapshot?.iphonePreview?.status]);

  const refresh = useCallback(
    async (manual = false) => {
      if (fetchInFlight.current) return;
      const generation = refreshGeneration.current;
      fetchInFlight.current = true;
      if (manual) setRefreshing(true);
      try {
        const nextSnapshot = await requestJson<ConsoleSnapshot>("/api/state", {
          headers: { Accept: "application/json" },
        });
        if (generation === refreshGeneration.current) {
          csrfToken.current = nextSnapshot.csrfToken;
          nextSnapshot.tasks.items = normalizeTasks(nextSnapshot.tasks.items);
          setSnapshot(nextSnapshot);
          setConnectionError(null);
          setLastUpdated(new Date());
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Status kunne ikke hentes.";
        setConnectionError(message);
        if (manual) pushToast(message, "error");
      } finally {
        fetchInFlight.current = false;
        setRefreshing(false);
      }
    },
    [pushToast],
  );

  const refreshBackend = useCallback(
    async (manual = false) => {
      if (
        !csrfToken.current ||
        backendRefreshInFlight.current ||
        mutationInFlight.current > 0
      ) {
        return;
      }
      backendRefreshInFlight.current = true;
      refreshGeneration.current += 1;
      if (manual) setRefreshing(true);
      try {
        const payload = await requestJson<ActionResponse>("/api/actions", {
          method: "POST",
          headers: mutationHeaders(csrfToken.current),
          body: JSON.stringify({ action: "refresh" }),
        });
        payload.state.tasks.items = normalizeTasks(payload.state.tasks.items);
        csrfToken.current = payload.state.csrfToken;
        setSnapshot(payload.state);
        setConnectionError(null);
        setLastUpdated(new Date());
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Backendstatus kunne ikke opdateres.";
        setConnectionError(message);
        if (manual) pushToast(message, "error");
      } finally {
        backendRefreshInFlight.current = false;
        setRefreshing(false);
      }
    },
    [pushToast],
  );

  useEffect(() => {
    const initialRequest = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, POLL_INTERVAL_MS);
    const backendTimer = window.setInterval(() => {
      if (!document.hidden && mutationInFlight.current === 0) {
        void refreshBackend();
      }
    }, 30_000);
    const onVisibility = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(initialRequest);
      window.clearInterval(timer);
      window.clearInterval(backendTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh, refreshBackend]);

  useEffect(() => {
    const onPopState = () => setRoute(currentRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const titles: Record<RoutePath, string> = {
      "/": "Overblik",
      "/services": "Tjenester",
      "/tasks": "Opgaver",
      "/not-found": "Siden findes ikke",
    };
    document.title = `${titles[route]} · Bare Træn udviklingspanel`;
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>("[data-page-heading]")
        ?.focus({ preventScroll: true });
      if (window.location.hash) {
        document
          .querySelector<HTMLElement>(window.location.hash)
          ?.scrollIntoView({ block: "start" });
      } else {
        window.scrollTo({ top: 0, behavior: "instant" });
      }
    });
  }, [route]);

  const navigate = useCallback((to: string) => {
    const url = new URL(to, window.location.origin);
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setRoute(isRoutePath(url.pathname) ? url.pathname : "/not-found");
  }, []);

  const setActionPending = useCallback((key: string, pending: boolean) => {
    setPendingActions((current) => {
      const next = new Set(current);
      if (pending) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const runAction = useCallback(
    async (action: AggregateAction | ServiceAction, serviceId?: ServiceId) => {
      const key = serviceId ? `${action}:${serviceId}` : action;
      if (!csrfToken.current || mutationInFlight.current > 0) return;
      mutationInFlight.current += 1;
      setActionPending(key, true);
      try {
        const payload = await requestJson<ActionResponse>("/api/actions", {
          method: "POST",
          headers: mutationHeaders(csrfToken.current),
          body: JSON.stringify(
            serviceId ? { action, service: serviceId } : { action },
          ),
        });
        payload.state.tasks.items = normalizeTasks(payload.state.tasks.items);
        csrfToken.current = payload.state.csrfToken;
        setSnapshot(payload.state);
        setConnectionError(null);
        setLastUpdated(new Date());
        const message =
          action === "start-local-web"
            ? "De lokale tjenester starter."
            : action === "stop-my-apps"
              ? "De lokale tjenester stopper."
              : action === "prepare-iphone-preview"
                ? payload.state.iphonePreview.status === "ready"
                  ? "Installationssiden åbnes."
                  : "iPhone-previewet klargøres. Du kan følge status på overblikket."
                : `${serviceId ? SERVICE_META[serviceId].title : "Tjenesten"} ${action === "start" ? "starter" : "stopper"}.`;
        pushToast(message);
      } catch (error) {
        pushToast(
          error instanceof Error
            ? error.message
            : "Handlingen kunne ikke gennemføres.",
          "error",
        );
      } finally {
        mutationInFlight.current -= 1;
        setActionPending(key, false);
        void refresh();
      }
    },
    [pushToast, refresh, setActionPending],
  );

  const replaceTasks = useCallback((tasks: TaskBoard) => {
    tasks.items = normalizeTasks(tasks.items);
    setSnapshot((current) => (current ? { ...current, tasks } : current));
  }, []);

  const reorderTask = useCallback(
    async (taskId: string, status: TaskStatus, beforeTaskId: string | null) => {
      if (!csrfToken.current || mutationInFlight.current > 0) return;
      mutationInFlight.current += 1;
      setPendingTasks((current) => new Set(current).add(taskId));
      try {
        const previousStatus = snapshot?.tasks.items.find(
          (task) => task.id === taskId,
        )?.status;
        const payload = await requestJson<TasksResponse>("/api/tasks/reorder", {
          method: "POST",
          headers: mutationHeaders(csrfToken.current),
          body: JSON.stringify({ taskId, status, beforeTaskId }),
        });
        replaceTasks(payload.tasks);
        pushToast(
          previousStatus !== status
            ? `Opgaven er flyttet til ${taskStatusLabel(status)}.`
            : "Opgaverækkefølgen er gemt.",
        );
      } catch (error) {
        pushToast(
          error instanceof Error
            ? error.message
            : "Opgavens placering kunne ikke gemmes.",
          "error",
        );
      } finally {
        mutationInFlight.current -= 1;
        setPendingTasks((current) => {
          const next = new Set(current);
          next.delete(taskId);
          return next;
        });
        void refresh();
      }
    },
    [pushToast, refresh, replaceTasks, snapshot?.tasks.items],
  );

  const saveTask = useCallback(
    async (draft: TaskDraft, taskId?: string) => {
      if (!csrfToken.current || mutationInFlight.current > 0) return false;
      mutationInFlight.current += 1;
      setTaskSaving(true);
      try {
        const body = taskId
          ? {
              action: "update",
              id: taskId,
              changes: {
                title: draft.title,
                details: draft.details,
                implementationNotes: draft.implementationNotes,
                evidence: draft.evidence,
                status: draft.status,
              },
            }
          : { action: "create", task: draft };
        const payload = await requestJson<TasksResponse>("/api/tasks", {
          method: "POST",
          headers: mutationHeaders(csrfToken.current),
          body: JSON.stringify(body),
        });
        replaceTasks(payload.tasks);
        pushToast(taskId ? "Opgaven er gemt." : "Opgaven er oprettet.");
        return true;
      } catch (error) {
        pushToast(
          error instanceof Error ? error.message : "Opgaven kunne ikke gemmes.",
          "error",
        );
        return false;
      } finally {
        mutationInFlight.current -= 1;
        setTaskSaving(false);
        void refresh();
      }
    },
    [pushToast, refresh, replaceTasks],
  );

  const deleteTask = useCallback(
    async (task: ConsoleTask) => {
      if (!csrfToken.current || mutationInFlight.current > 0) return false;
      if (!window.confirm(`Slet “${task.title}”? Det kan ikke fortrydes.`))
        return false;
      mutationInFlight.current += 1;
      setTaskSaving(true);
      try {
        const payload = await requestJson<TasksResponse>("/api/tasks", {
          method: "POST",
          headers: mutationHeaders(csrfToken.current),
          body: JSON.stringify({ action: "delete", id: task.id }),
        });
        replaceTasks(payload.tasks);
        pushToast("Opgaven er slettet.");
        return true;
      } catch (error) {
        pushToast(
          error instanceof Error
            ? error.message
            : "Opgaven kunne ikke slettes.",
          "error",
        );
        return false;
      } finally {
        mutationInFlight.current -= 1;
        setTaskSaving(false);
        void refresh();
      }
    },
    [pushToast, refresh, replaceTasks],
  );

  const page =
    route === "/" ? (
      <OverviewPage
        navigate={navigate}
        pendingActions={pendingActions}
        prepareIphonePreview={() => runAction("prepare-iphone-preview")}
        refresh={refreshBackend}
        refreshing={refreshing}
        runAggregateAction={(action) => runAction(action)}
        snapshot={snapshot}
      />
    ) : route === "/services" ? (
      <ServicesPage
        pendingActions={pendingActions}
        refresh={refreshBackend}
        refreshing={refreshing}
        runAggregateAction={(action) => runAction(action)}
        runServiceAction={(action, serviceId) => runAction(action, serviceId)}
        showLogs={setSelectedLog}
        snapshot={snapshot}
      />
    ) : route === "/tasks" ? (
      <TasksPage
        openTaskDialog={setTaskDialog}
        pendingTasks={pendingTasks}
        reorderTask={reorderTask}
        snapshot={snapshot}
      />
    ) : (
      <NotFoundPage navigate={navigate} />
    );

  return (
    <div className="min-h-screen py-0 sm:px-5 sm:py-5">
      <a
        className="fixed top-3 left-3 z-50 -translate-y-[160%] rounded-xl bg-ink px-3.5 py-2.5 text-[12px] font-bold text-white transition focus:translate-y-0"
        href="#main-content"
      >
        Gå til indhold
      </a>
      <div className="mx-auto min-h-screen max-w-[1480px] overflow-hidden border-line bg-paper shadow-panel sm:min-h-[calc(100vh-40px)] sm:rounded-[30px] sm:border">
        <header className="sticky top-0 z-30 border-b border-line bg-paper/94 backdrop-blur-xl">
          <div className="flex min-h-[76px] items-center justify-between gap-4 px-4 sm:px-7">
            <RouteLink
              className="flex min-w-0 items-center gap-3 no-underline"
              navigate={navigate}
              to="/"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-[#0e9e97] text-white shadow-[0_7px_16px_rgba(14,158,151,0.22)]">
                <svg
                  aria-hidden="true"
                  className="size-5.5"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path d="M7 8.5h10M7 15.5h10M5 10.75v2.5M19 10.75v2.5M3.5 9.5v5M20.5 9.5v5" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-[780] tracking-[-0.01em] text-ink">
                  Bare Træn
                </span>
                <span className="block truncate text-[10px] text-muted">
                  Udviklingspanel
                </span>
              </span>
            </RouteLink>

            <nav
              aria-label="Primær navigation"
              className="hidden items-center gap-1 rounded-xl bg-[#f4f5f2] p-1 sm:flex"
            >
              {NAVIGATION.map((item) => {
                const active = route === item.path;
                return (
                  <RouteLink
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold transition ${
                      active
                        ? "bg-white text-ink shadow-[0_2px_7px_rgba(22,50,79,0.08)]"
                        : "text-muted hover:text-ink"
                    }`}
                    key={item.path}
                    navigate={navigate}
                    to={item.path}
                  >
                    <Icon className="size-3.5" name={item.icon} />
                    {item.label}
                  </RouteLink>
                );
              })}
            </nav>

            <div className="flex items-center gap-2">
              <span
                className={`hidden min-h-8 items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold md:inline-flex ${
                  connectionError
                    ? "border-[#e9c5be] bg-[#fff0ed] text-danger"
                    : "border-[#bcded4] bg-[#f0faf6] text-[#256547]"
                }`}
                title={
                  connectionError || "Panelet kan kun åbnes på denne computer"
                }
              >
                <span className="size-1.5 rounded-full bg-current" />
                {connectionError ? "Forbindelsesfejl" : "Kun på denne Mac"}
              </span>
              <Button
                aria-label="Opdatér status"
                className="size-10 px-0"
                disabled={refreshing}
                onClick={() => void refreshBackend(true)}
                variant="quiet"
              >
                <Icon
                  className={`size-4 ${refreshing ? "animate-gentle-spin" : ""}`}
                  name="refresh"
                />
              </Button>
            </div>
          </div>

          <nav
            aria-label="Primær navigation"
            className="grid grid-cols-3 border-t border-line sm:hidden"
          >
            {NAVIGATION.map((item) => {
              const active = route === item.path;
              return (
                <RouteLink
                  className={`inline-flex min-h-12 items-center justify-center gap-1.5 border-b-2 px-2 py-2 text-[10px] font-bold ${
                    active
                      ? "border-brand bg-soft text-brand-deep"
                      : "border-transparent text-muted"
                  }`}
                  key={item.path}
                  navigate={navigate}
                  to={item.path}
                >
                  <Icon className="size-3.5" name={item.icon} />
                  {item.label}
                </RouteLink>
              );
            })}
          </nav>
          {connectionError ? (
            <div
              className="border-t border-[#e9c5be] bg-[#fff0ed] px-5 py-2 text-center text-[10px] font-semibold text-danger"
              role="status"
            >
              Status kunne ikke opdateres. Viser senest kendte data.
            </div>
          ) : null}
        </header>

        <main
          className="min-h-[65vh] px-4 py-8 sm:px-7 sm:py-10 lg:px-10 lg:py-12"
          id="main-content"
        >
          {page}
        </main>

        <GitPanel snapshot={snapshot} />
        <footer className="flex flex-col gap-1 border-t border-line bg-[#f8f7f2] px-5 py-4 text-[9px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p>Bare Træn udviklingspanel</p>
          <p>
            {lastUpdated
              ? `Status opdateret ${formatTime(lastUpdated)}`
              : "Henter status…"}{" "}
            · Kun syntetiske testdata
          </p>
        </footer>
      </div>

      <LogDialog
        onClose={() => setSelectedLog(null)}
        serviceId={selectedLog}
        snapshot={snapshot}
      />
      {taskDialog ? (
        <TaskDialog
          key={taskDialog.mode === "edit" ? taskDialog.task?.id : "create"}
          onClose={() => !taskSaving && setTaskDialog(null)}
          onDelete={deleteTask}
          onSave={saveTask}
          saving={taskSaving}
          state={taskDialog}
        />
      ) : null}

      <div
        aria-atomic="true"
        aria-live="assertive"
        className="fixed right-4 bottom-4 z-50 grid w-[min(360px,calc(100%-32px))] gap-2"
      >
        {toasts.map((toast) => (
          <div
            className="animate-toast-in flex items-start gap-2.5 rounded-[13px] border border-[#39556a] bg-[#173147] px-4 py-3 text-[11px] leading-5 text-white shadow-[0_13px_30px_rgba(16,38,56,0.24)]"
            key={toast.id}
            role={toast.kind === "error" ? "alert" : "status"}
          >
            <span
              aria-hidden="true"
              className={`mt-1.5 size-2 shrink-0 rounded-full ${toast.kind === "error" ? "bg-[#ff8c82]" : "bg-[#6bd39d]"}`}
            />
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
