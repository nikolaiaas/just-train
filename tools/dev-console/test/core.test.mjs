import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";

import {
  BoundedLog,
  InputError,
  TASK_BOARD_VERSION,
  TASK_STATUSES,
  hasSequentialTaskPriorities,
  isAllowedHost,
  isSameOriginRequest,
  resolveStaticPath,
  sanitizeLogText,
  validateActionRequest,
  validateTaskBoard,
  validateTaskChanges,
  validateTaskReorderRequest,
  validateTaskRequest,
  validateTaskStatus,
} from "../server/core.mjs";

describe("development action validation", () => {
  test("accepts only fixed service and aggregate actions", () => {
    assert.deepEqual(
      validateActionRequest({ action: "start", service: "admin" }),
      {
        action: "start",
        service: "admin",
      },
    );
    assert.deepEqual(validateActionRequest({ action: "start-local-web" }), {
      action: "start-local-web",
    });
    assert.deepEqual(validateActionRequest({ action: "stop-my-apps" }), {
      action: "stop-my-apps",
    });
  });

  test("rejects arbitrary commands and unsupported fields", () => {
    assert.throws(
      () =>
        validateActionRequest({ action: "run", command: "rm -rf something" }),
      InputError,
    );
    assert.throws(
      () => validateActionRequest({ action: "start", service: "shell" }),
      InputError,
    );
    assert.throws(
      () =>
        validateActionRequest({
          action: "start",
          service: "admin",
          arguments: ["--inspect"],
        }),
      InputError,
    );
  });
});

describe("task validation", () => {
  test("uses the four workflow statuses", () => {
    assert.equal(TASK_BOARD_VERSION, 2);
    assert.deepEqual(TASK_STATUSES, ["backlog", "todo", "doing", "done"]);
  });

  test("normalizes create and update requests", () => {
    assert.deepEqual(
      validateTaskRequest({
        action: "create",
        task: { title: "  Connect sign-in  ", status: "todo" },
      }),
      {
        action: "create",
        task: {
          title: "Connect sign-in",
          details: "",
          status: "todo",
        },
      },
    );
    assert.deepEqual(validateTaskChanges({ status: "doing" }), {
      status: "doing",
    });
    assert.equal(validateTaskStatus("done"), "done");
  });

  test("rejects invalid fields, statuses, ids, and duplicate persisted ids", () => {
    assert.throws(() => validateTaskStatus("finished"), InputError);
    assert.throws(() => validateTaskStatus("in-progress"), InputError);
    assert.throws(() => validateTaskStatus("blocked"), InputError);
    assert.throws(() => validateTaskStatus("__proto__"), InputError);
    assert.throws(
      () =>
        validateTaskRequest({
          action: "create",
          task: { title: "Task", command: "pnpm anything" },
        }),
      InputError,
    );
    assert.throws(
      () =>
        validateTaskBoard({
          version: 2,
          updatedAt: "2026-08-20T12:00:00.000Z",
          items: [
            {
              id: "same-id",
              title: "One",
              details: "",
              status: "todo",
              priority: 0,
              createdAt: "2026-08-20T12:00:00.000Z",
              updatedAt: "2026-08-20T12:00:00.000Z",
            },
            {
              id: "same-id",
              title: "Two",
              details: "",
              status: "done",
              priority: 0,
              createdAt: "2026-08-20T12:00:00.000Z",
              updatedAt: "2026-08-20T12:00:00.000Z",
            },
          ],
        }),
      /duplicate id/,
    );
  });

  test("requires sequential priorities and returns tasks in board order", () => {
    const timestamp = "2026-08-20T12:00:00.000Z";
    const task = (id, status, priority) => ({
      id,
      title: id,
      details: "",
      status,
      priority,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const board = validateTaskBoard({
      version: 2,
      updatedAt: timestamp,
      items: [
        task("second", "todo", 1),
        task("finished", "done", 0),
        task("first", "todo", 0),
      ],
    });

    assert.equal(hasSequentialTaskPriorities(board.items), true);
    assert.deepEqual(
      board.items.map(({ id, priority }) => [id, priority]),
      [
        ["first", 0],
        ["second", 1],
        ["finished", 0],
      ],
    );
    assert.throws(
      () =>
        validateTaskBoard({
          version: 2,
          updatedAt: timestamp,
          items: [task("first", "todo", 0), task("gap", "todo", 2)],
        }),
      /sequential/,
    );
  });

  test("validates the exact reorder contract", () => {
    assert.deepEqual(
      validateTaskReorderRequest({
        taskId: "moving-task",
        status: "doing",
        beforeTaskId: "target-task",
      }),
      {
        taskId: "moving-task",
        status: "doing",
        beforeTaskId: "target-task",
      },
    );
    assert.deepEqual(
      validateTaskReorderRequest({
        taskId: "moving-task",
        status: "done",
        beforeTaskId: null,
      }),
      { taskId: "moving-task", status: "done", beforeTaskId: null },
    );
    assert.throws(
      () =>
        validateTaskReorderRequest({
          taskId: "moving-task",
          status: "todo",
          beforeTaskId: null,
          arbitrary: true,
        }),
      /unsupported fields/,
    );
    assert.throws(
      () =>
        validateTaskReorderRequest({
          taskId: "moving-task",
          status: "todo",
        }),
      /requires taskId, status, and beforeTaskId/,
    );
    assert.throws(
      () =>
        validateTaskReorderRequest({
          taskId: "moving-task",
          status: "blocked",
          beforeTaskId: null,
        }),
      InputError,
    );
    assert.throws(
      () =>
        validateTaskReorderRequest({
          taskId: "moving-task",
          status: "todo",
          beforeTaskId: "moving-task",
        }),
      /before itself/,
    );
  });
});

describe("local request boundaries", () => {
  test("allows only the fixed loopback hosts and matching origins", () => {
    assert.equal(isAllowedHost("127.0.0.1:11009"), true);
    assert.equal(isAllowedHost("localhost:11009"), true);
    assert.equal(isAllowedHost("example.com:11009"), false);
    assert.equal(
      isSameOriginRequest("http://127.0.0.1:11009", "127.0.0.1:11009"),
      true,
    );
    assert.equal(
      isSameOriginRequest("http://localhost:11009", "127.0.0.1:11009"),
      false,
    );
    assert.equal(
      isSameOriginRequest("https://example.com", "127.0.0.1:11009"),
      false,
    );
  });

  test("keeps static files inside the public directory", () => {
    const publicDirectory = path.join(os.tmpdir(), "bare-traen-public");
    assert.equal(
      resolveStaticPath(publicDirectory, "/"),
      path.join(publicDirectory, "index.html"),
    );
    assert.equal(
      resolveStaticPath(publicDirectory, "/assets/app.js"),
      path.join(publicDirectory, "assets", "app.js"),
    );
    assert.throws(
      () => resolveStaticPath(publicDirectory, "/..%2Ftasks.json"),
      InputError,
    );
  });
});

describe("safe bounded logs", () => {
  test("hides Supabase credentials and common token forms", () => {
    assert.equal(
      sanitizeLogText("SERVICE_ROLE_KEY=super-secret-value"),
      "[sensitive output hidden]",
    );
    assert.equal(
      sanitizeLogText(
        "DB URL: postgresql://postgres:password@127.0.0.1:54322/postgres",
      ),
      "[sensitive output hidden]",
    );
    assert.equal(
      sanitizeLogText(
        "request Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
      ),
      "request Authorization: Bearer [hidden]",
    );
    assert.equal(
      sanitizeLogText("open https://user:pass@example.test/path"),
      "open https://[credentials-hidden]@example.test/path",
    );
  });

  test("keeps only the configured log tail", () => {
    const log = new BoundedLog({ maxEntries: 2, maxCharacters: 1_000 });
    log.add("system", "one", "2026-08-20T12:00:00.000Z");
    log.add("stdout", "two", "2026-08-20T12:00:01.000Z");
    log.add("stderr", "three", "2026-08-20T12:00:02.000Z");
    assert.deepEqual(
      log.snapshot().map((entry) => entry.text),
      ["two", "three"],
    );
  });
});
