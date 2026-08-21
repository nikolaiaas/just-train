import path from "node:path";

export const TASK_STATUSES = Object.freeze([
  "backlog",
  "todo",
  "doing",
  "done",
]);
export const TASK_BOARD_VERSION = 3;
export const TASK_EVIDENCE_KINDS = Object.freeze(["image", "link"]);
export const MAX_TASK_EVIDENCE_ITEMS = 10;

export const SERVICE_IDS = Object.freeze([
  "admin",
  "mobileWeb",
  "iphoneMetro",
  "supabase",
]);

const TASK_STATUS_SET = new Set(TASK_STATUSES);
const TASK_EVIDENCE_KIND_SET = new Set(TASK_EVIDENCE_KINDS);
const LEGACY_TASK_STATUS_MAP = Object.freeze({
  "in-progress": "doing",
  blocked: "backlog",
});
const SERVICE_ID_SET = new Set(SERVICE_IDS);
const TASK_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const TASK_EVIDENCE_IMAGE_PATH_PATTERN =
  /^[a-z0-9][a-z0-9_-]{0,63}\/[a-z0-9][a-z0-9._-]{0,127}\.(?:jpe?g|png|webp)$/;
const TASK_SECRET_VALUE_PATTERN =
  /(?:\bsb_secret_[A-Za-z0-9_-]{8,}|\bsk-or-v1-[A-Za-z0-9_-]{16,}|\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}(?:\.[A-Za-z0-9_-]{8,})?|\b(?:access_token|refresh_token|token_hash)\s*[:=]\s*[^\s]+)/i;
const SENSITIVE_LABEL_PATTERN =
  /\b(?:anon(?:ymous)?(?:[_ -]?key)?|api[_ -]?key|access[_ -]?key|database[_ -]?url|db[_ -]?url|jwt(?:[_ -]?secret)?|password|publishable[_ -]?key|refresh[_ -]?token|secret(?:[_ -]?key)?|service[_ -]?role(?:[_ -]?key)?|supabase[_ -]?(?:key|token))\b/i;

export class InputError extends Error {
  constructor(message, { code = "invalid_input", statusCode = 400 } = {}) {
    super(message);
    this.name = "InputError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function assertPlainObject(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new InputError(`${label} must be a JSON object.`);
  }

  return value;
}

function assertOnlyKeys(object, allowedKeys, label) {
  const unexpected = Object.keys(object).filter((key) => !allowedKeys.has(key));
  if (unexpected.length > 0) {
    throw new InputError(
      `${label} contains unsupported fields: ${unexpected.join(", ")}.`,
    );
  }
}

function validateText(value, label, { maxLength, required = false } = {}) {
  if (value === undefined && !required) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new InputError(`${label} must be text.`);
  }

  const normalized = value.trim();
  if (required && normalized.length === 0) {
    throw new InputError(`${label} cannot be empty.`);
  }
  if (normalized.length > maxLength) {
    throw new InputError(`${label} must be at most ${maxLength} characters.`);
  }
  if (TASK_SECRET_VALUE_PATTERN.test(normalized)) {
    throw new InputError(
      `${label} appears to contain a credential or sign-in token and cannot be stored in the tracked task board.`,
    );
  }

  return normalized;
}

export function validateTaskEvidenceImagePath(value) {
  const imagePath = validateText(value, "Evidence image path", {
    maxLength: 220,
    required: true,
  });
  if (
    imagePath.includes("%") ||
    imagePath.includes("\\") ||
    !TASK_EVIDENCE_IMAGE_PATH_PATTERN.test(imagePath)
  ) {
    throw new InputError(
      "Evidence image path must be task-id/lowercase-file.png, .jpg, .jpeg, or .webp.",
    );
  }
  return imagePath;
}

export function resolveEvidenceImagePath(evidenceDirectory, imagePath) {
  const validatedPath = validateTaskEvidenceImagePath(imagePath);
  const evidenceRoot = path.resolve(evidenceDirectory);
  const candidate = path.resolve(evidenceRoot, ...validatedPath.split("/"));
  if (!candidate.startsWith(`${evidenceRoot}${path.sep}`)) {
    throw new InputError("Evidence image path escapes the evidence directory.");
  }
  return candidate;
}

function validateTaskEvidenceLink(value) {
  const suppliedUrl = validateText(value, "Evidence link URL", {
    maxLength: 1_000,
    required: true,
  });
  let url;
  try {
    url = new URL(suppliedUrl);
  } catch {
    throw new InputError("Evidence link URL must be a valid HTTPS URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search) {
    throw new InputError(
      "Evidence links must use HTTPS and cannot contain credentials or query parameters.",
    );
  }
  return url.toString();
}

export function validateTaskEvidence(value) {
  const evidence = assertPlainObject(value, "Task evidence");
  if (
    typeof evidence.kind !== "string" ||
    !TASK_EVIDENCE_KIND_SET.has(evidence.kind)
  ) {
    throw new InputError(
      `Task evidence kind must be one of: ${TASK_EVIDENCE_KINDS.join(", ")}.`,
    );
  }

  const label = validateText(evidence.label, "Evidence label", {
    maxLength: 120,
    required: true,
  });
  if (evidence.kind === "image") {
    assertOnlyKeys(
      evidence,
      new Set(["kind", "label", "path"]),
      "Task evidence",
    );
    return {
      kind: "image",
      label,
      path: validateTaskEvidenceImagePath(evidence.path),
    };
  }

  assertOnlyKeys(evidence, new Set(["kind", "label", "url"]), "Task evidence");
  return {
    kind: "link",
    label,
    url: validateTaskEvidenceLink(evidence.url),
  };
}

export function validateTaskEvidenceList(value) {
  if (!Array.isArray(value)) {
    throw new InputError("Task evidence must be an array.");
  }
  if (value.length > MAX_TASK_EVIDENCE_ITEMS) {
    throw new InputError(
      `A task may contain at most ${MAX_TASK_EVIDENCE_ITEMS} evidence items.`,
    );
  }
  const evidence = value.map(validateTaskEvidence);
  const references = new Set();
  for (const item of evidence) {
    const reference = item.kind === "image" ? item.path : item.url;
    if (references.has(reference)) {
      throw new InputError(
        "Task evidence cannot contain duplicate references.",
      );
    }
    references.add(reference);
  }
  return evidence;
}

export function validateTaskId(value) {
  if (typeof value !== "string" || !TASK_ID_PATTERN.test(value)) {
    throw new InputError(
      "Task id must contain 1-64 lowercase letters, numbers, underscores, or hyphens.",
    );
  }

  return value;
}

export function validateTaskStatus(value) {
  if (typeof value !== "string" || !TASK_STATUS_SET.has(value)) {
    throw new InputError(
      `Task status must be one of: ${TASK_STATUSES.join(", ")}.`,
    );
  }

  return value;
}

export function normalizeLegacyTaskStatus(value) {
  return Object.hasOwn(LEGACY_TASK_STATUS_MAP, value)
    ? LEGACY_TASK_STATUS_MAP[value]
    : validateTaskStatus(value);
}

export function validateTask(
  value,
  {
    persisted = false,
    migrateLegacyStatus = false,
    allowMissingPriority = false,
    allowMissingEvidence = false,
  } = {},
) {
  const task = assertPlainObject(value, "Task");
  const allowedKeys = persisted
    ? new Set([
        "id",
        "title",
        "details",
        "implementationNotes",
        "evidence",
        "status",
        "priority",
        "createdAt",
        "updatedAt",
      ])
    : new Set([
        "title",
        "details",
        "implementationNotes",
        "evidence",
        "status",
      ]);
  assertOnlyKeys(task, allowedKeys, "Task");
  if (
    persisted &&
    !allowMissingEvidence &&
    (!Object.hasOwn(task, "implementationNotes") ||
      !Object.hasOwn(task, "evidence"))
  ) {
    throw new InputError(
      "Persisted tasks require implementationNotes and evidence fields.",
    );
  }

  const content = {
    title: validateText(task.title, "Task title", {
      maxLength: 160,
      required: true,
    }),
    details: validateText(task.details ?? "", "Task details", {
      maxLength: 4_000,
    }),
    implementationNotes: validateText(
      Object.hasOwn(task, "implementationNotes")
        ? task.implementationNotes
        : "",
      "Task implementation notes",
      { maxLength: 4_000 },
    ),
    evidence: validateTaskEvidenceList(
      Object.hasOwn(task, "evidence") ? task.evidence : [],
    ),
    status: migrateLegacyStatus
      ? normalizeLegacyTaskStatus(task.status ?? "todo")
      : validateTaskStatus(task.status ?? "todo"),
  };

  if (persisted) {
    const priority = validateTaskPriority(task.priority, {
      allowMissing: allowMissingPriority,
    });
    return {
      id: validateTaskId(task.id),
      ...content,
      ...(priority === undefined ? {} : { priority }),
      createdAt: validateTimestamp(task.createdAt, "Task createdAt"),
      updatedAt: validateTimestamp(task.updatedAt, "Task updatedAt"),
    };
  }

  return content;
}

export function validateTaskPriority(value, { allowMissing = false } = {}) {
  if (value === undefined && allowMissing) return undefined;
  if (!Number.isInteger(value) || value < 0 || value >= 500) {
    throw new InputError("Task priority must be an integer from 0 to 499.");
  }
  return value;
}

export function validateTaskChanges(value) {
  const changes = assertPlainObject(value, "Task changes");
  assertOnlyKeys(
    changes,
    new Set(["title", "details", "implementationNotes", "evidence", "status"]),
    "Task changes",
  );
  if (Object.keys(changes).length === 0) {
    throw new InputError("Task changes cannot be empty.");
  }

  const normalized = {};
  if (Object.hasOwn(changes, "title")) {
    normalized.title = validateText(changes.title, "Task title", {
      maxLength: 160,
      required: true,
    });
  }
  if (Object.hasOwn(changes, "details")) {
    normalized.details = validateText(changes.details, "Task details", {
      maxLength: 4_000,
    });
  }
  if (Object.hasOwn(changes, "implementationNotes")) {
    normalized.implementationNotes = validateText(
      changes.implementationNotes,
      "Task implementation notes",
      { maxLength: 4_000 },
    );
  }
  if (Object.hasOwn(changes, "evidence")) {
    normalized.evidence = validateTaskEvidenceList(changes.evidence);
  }
  if (Object.hasOwn(changes, "status")) {
    normalized.status = validateTaskStatus(changes.status);
  }

  return normalized;
}

export function validateTaskBoard(
  value,
  {
    migrateLegacyStatuses = false,
    migratePriorities = false,
    migrateEvidence = false,
  } = {},
) {
  const board = assertPlainObject(value, "Task board");
  assertOnlyKeys(
    board,
    new Set(["version", "updatedAt", "items"]),
    "Task board",
  );
  const supportedVersion =
    board.version === TASK_BOARD_VERSION ||
    (migrateEvidence && (board.version === 1 || board.version === 2));
  if (!supportedVersion) {
    throw new InputError(`Task board version must be ${TASK_BOARD_VERSION}.`);
  }
  if (!Array.isArray(board.items)) {
    throw new InputError("Task board items must be an array.");
  }
  if (board.items.length > 500) {
    throw new InputError("Task board may contain at most 500 tasks.");
  }

  const items = board.items.map((task) =>
    validateTask(task, {
      persisted: true,
      migrateLegacyStatus: migrateLegacyStatuses,
      allowMissingPriority: migratePriorities && board.version < 3,
      allowMissingEvidence: migrateEvidence && board.version < 3,
    }),
  );
  const ids = new Set();
  for (const task of items) {
    if (ids.has(task.id)) {
      throw new InputError(`Task board contains duplicate id: ${task.id}.`);
    }
    ids.add(task.id);
  }

  if (!migratePriorities && !hasSequentialTaskPriorities(items)) {
    throw new InputError(
      "Task priorities must be sequential within each status column.",
    );
  }

  const fileOrderStatuses = new Set();
  if (board.version === 1) {
    for (const status of TASK_STATUSES) fileOrderStatuses.add(status);
  } else if (migratePriorities) {
    for (const status of TASK_STATUSES) {
      if (
        items.some(
          (task) => task.status === status && task.priority === undefined,
        )
      ) {
        fileOrderStatuses.add(status);
      }
    }
  }
  const canonicalItems = canonicalizeTaskPriorities(items, {
    fileOrderStatuses,
  });

  return {
    version: TASK_BOARD_VERSION,
    updatedAt:
      board.updatedAt === null
        ? null
        : validateTimestamp(board.updatedAt, "Task board updatedAt"),
    items: canonicalItems,
  };
}

export function hasSequentialTaskPriorities(items) {
  if (!Array.isArray(items)) return false;
  return TASK_STATUSES.every((status) => {
    const priorities = items
      .filter((task) => task?.status === status)
      .map((task) => task?.priority)
      .sort((first, second) => first - second);
    return priorities.every(
      (priority, index) => Number.isInteger(priority) && priority === index,
    );
  });
}

export function canonicalizeTaskPriorities(
  items,
  { fileOrderStatuses = new Set() } = {},
) {
  return TASK_STATUSES.flatMap((status) => {
    const column = items
      .map((task, fileIndex) => ({ task, fileIndex }))
      .filter(({ task }) => task.status === status);
    if (!fileOrderStatuses.has(status)) {
      column.sort(
        (first, second) =>
          first.task.priority - second.task.priority ||
          first.fileIndex - second.fileIndex,
      );
    }
    return column.map(({ task }, priority) => ({
      id: task.id,
      title: task.title,
      details: task.details,
      implementationNotes: task.implementationNotes,
      evidence: task.evidence,
      status: task.status,
      priority,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    }));
  });
}

function validateTimestamp(value, label) {
  if (
    typeof value !== "string" ||
    value.length > 40 ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new InputError(`${label} must be an ISO timestamp.`);
  }

  return value;
}

export function validateActionRequest(value) {
  const body = assertPlainObject(value, "Action request");
  assertOnlyKeys(body, new Set(["action", "service"]), "Action request");

  if (
    body.action === "start-local-web" ||
    body.action === "stop-my-apps" ||
    body.action === "prepare-iphone-preview" ||
    body.action === "refresh"
  ) {
    if (Object.hasOwn(body, "service")) {
      throw new InputError(`${body.action} does not accept a service.`);
    }
    return { action: body.action };
  }

  if (body.action !== "start" && body.action !== "stop") {
    throw new InputError("Unknown development action.");
  }
  if (typeof body.service !== "string" || !SERVICE_ID_SET.has(body.service)) {
    throw new InputError(`Service must be one of: ${SERVICE_IDS.join(", ")}.`);
  }

  return { action: body.action, service: body.service };
}

export function validateTaskRequest(value) {
  const body = assertPlainObject(value, "Task request");
  assertOnlyKeys(
    body,
    new Set(["action", "task", "id", "changes"]),
    "Task request",
  );

  if (body.action === "create") {
    if (Object.hasOwn(body, "id") || Object.hasOwn(body, "changes")) {
      throw new InputError("Create task accepts only a task.");
    }
    return { action: "create", task: validateTask(body.task) };
  }
  if (body.action === "update") {
    return {
      action: "update",
      id: validateTaskId(body.id),
      changes: validateTaskChanges(body.changes),
    };
  }
  if (body.action === "delete") {
    if (Object.hasOwn(body, "task") || Object.hasOwn(body, "changes")) {
      throw new InputError("Delete task accepts only an id.");
    }
    return { action: "delete", id: validateTaskId(body.id) };
  }

  throw new InputError("Unknown task action.");
}

export function validateTaskReorderRequest(value) {
  const body = assertPlainObject(value, "Task reorder request");
  assertOnlyKeys(
    body,
    new Set(["taskId", "status", "beforeTaskId"]),
    "Task reorder request",
  );
  if (
    !Object.hasOwn(body, "taskId") ||
    !Object.hasOwn(body, "status") ||
    !Object.hasOwn(body, "beforeTaskId")
  ) {
    throw new InputError(
      "Task reorder request requires taskId, status, and beforeTaskId.",
    );
  }
  const taskId = validateTaskId(body.taskId);
  const status = validateTaskStatus(body.status);
  const beforeTaskId =
    body.beforeTaskId === null ? null : validateTaskId(body.beforeTaskId);
  if (beforeTaskId === taskId) {
    throw new InputError("A task cannot be placed before itself.");
  }
  return { taskId, status, beforeTaskId };
}

export function isAllowedHost(hostHeader, port = 11009) {
  return (
    hostHeader === `127.0.0.1:${port}` || hostHeader === `localhost:${port}`
  );
}

export function isSameOriginRequest(originHeader, hostHeader, port = 11009) {
  if (!isAllowedHost(hostHeader, port) || typeof originHeader !== "string") {
    return false;
  }

  return originHeader === `http://${hostHeader}`;
}

export function resolveStaticPath(publicDirectory, requestPath) {
  if (typeof requestPath !== "string" || requestPath.includes("\0")) {
    throw new InputError("Invalid static path.");
  }

  let decoded;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    throw new InputError("Invalid URL encoding.");
  }

  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const publicRoot = path.resolve(publicDirectory);
  const candidate = path.resolve(publicRoot, relative);
  if (
    candidate !== publicRoot &&
    !candidate.startsWith(`${publicRoot}${path.sep}`)
  ) {
    throw new InputError("Static path escapes the public directory.");
  }

  return candidate;
}

export function sanitizeLogText(value) {
  let text = String(value)
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, "")
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();

  if (text.length === 0) {
    return "";
  }

  if (SENSITIVE_LABEL_PATTERN.test(text)) {
    return "[sensitive output hidden]";
  }

  text = text
    .replace(/(https?:\/\/)[^\s/:@]+:[^\s/@]+@/gi, "$1[credentials-hidden]@")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [hidden]")
    .replace(
      /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}(?:\.[A-Za-z0-9_-]{8,})?/g,
      "[token-hidden]",
    )
    .replace(
      /([?&](?:access_token|api_key|apikey|key|refresh_token|token)=)[^&#\s]+/gi,
      "$1[hidden]",
    );

  return text.slice(0, 1_000);
}

export class BoundedLog {
  constructor({ maxEntries = 200, maxCharacters = 50_000 } = {}) {
    this.maxEntries = maxEntries;
    this.maxCharacters = maxCharacters;
    this.entries = [];
    this.characterCount = 0;
  }

  add(stream, value, at = new Date().toISOString()) {
    const text = sanitizeLogText(value);
    if (!text) return;

    const entry = { at, stream, text };
    this.entries.push(entry);
    this.characterCount += text.length;

    while (
      this.entries.length > this.maxEntries ||
      this.characterCount > this.maxCharacters
    ) {
      const removed = this.entries.shift();
      this.characterCount -= removed.text.length;
    }
  }

  snapshot() {
    return this.entries.map((entry) => ({ ...entry }));
  }
}
