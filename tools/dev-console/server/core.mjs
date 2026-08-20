import path from "node:path";

export const TASK_STATUSES = Object.freeze([
  "backlog",
  "todo",
  "doing",
  "done",
]);
export const TASK_BOARD_VERSION = 2;

export const SERVICE_IDS = Object.freeze([
  "admin",
  "mobileWeb",
  "iphoneMetro",
  "supabase",
]);

const TASK_STATUS_SET = new Set(TASK_STATUSES);
const LEGACY_TASK_STATUS_MAP = Object.freeze({
  "in-progress": "doing",
  blocked: "backlog",
});
const SERVICE_ID_SET = new Set(SERVICE_IDS);
const TASK_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
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

  return normalized;
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
  } = {},
) {
  const task = assertPlainObject(value, "Task");
  const allowedKeys = persisted
    ? new Set([
        "id",
        "title",
        "details",
        "status",
        "priority",
        "createdAt",
        "updatedAt",
      ])
    : new Set(["title", "details", "status"]);
  assertOnlyKeys(task, allowedKeys, "Task");

  const content = {
    title: validateText(task.title, "Task title", {
      maxLength: 160,
      required: true,
    }),
    details: validateText(task.details ?? "", "Task details", {
      maxLength: 4_000,
    }),
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
    new Set(["title", "details", "status"]),
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
  if (Object.hasOwn(changes, "status")) {
    normalized.status = validateTaskStatus(changes.status);
  }

  return normalized;
}

export function validateTaskBoard(
  value,
  { migrateLegacyStatuses = false, migratePriorities = false } = {},
) {
  const board = assertPlainObject(value, "Task board");
  assertOnlyKeys(
    board,
    new Set(["version", "updatedAt", "items"]),
    "Task board",
  );
  const supportedVersion =
    board.version === TASK_BOARD_VERSION ||
    (migratePriorities && board.version === 1);
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
      allowMissingPriority: migratePriorities,
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
