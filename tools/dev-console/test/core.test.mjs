import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";

import {
  BoundedLog,
  InputError,
  MAX_TASK_EVIDENCE_ITEMS,
  TASK_BOARD_VERSION,
  TASK_EVIDENCE_KINDS,
  TASK_STATUSES,
  hasSequentialTaskPriorities,
  isAllowedHost,
  isSameOriginRequest,
  resolveEvidenceImagePath,
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
    assert.deepEqual(
      validateActionRequest({ action: "prepare-iphone-preview" }),
      { action: "prepare-iphone-preview" },
    );
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
    assert.throws(
      () =>
        validateActionRequest({
          action: "prepare-iphone-preview",
          service: "iphoneMetro",
        }),
      InputError,
    );
    assert.throws(
      () =>
        validateActionRequest({
          action: "prepare-iphone-preview",
          url: "https://example.test/build",
        }),
      InputError,
    );
  });
});

describe("task validation", () => {
  test("uses the four workflow statuses", () => {
    assert.equal(TASK_BOARD_VERSION, 3);
    assert.deepEqual(TASK_STATUSES, ["backlog", "todo", "doing", "done"]);
    assert.deepEqual(TASK_EVIDENCE_KINDS, ["image", "link"]);
    assert.equal(MAX_TASK_EVIDENCE_ITEMS, 10);
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
          implementationNotes: "",
          evidence: [],
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
          version: 3,
          updatedAt: "2026-08-20T12:00:00.000Z",
          items: [
            {
              id: "same-id",
              title: "One",
              details: "",
              implementationNotes: "",
              evidence: [],
              status: "todo",
              priority: 0,
              createdAt: "2026-08-20T12:00:00.000Z",
              updatedAt: "2026-08-20T12:00:00.000Z",
            },
            {
              id: "same-id",
              title: "Two",
              details: "",
              implementationNotes: "",
              evidence: [],
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
      implementationNotes: "",
      evidence: [],
      status,
      priority,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const board = validateTaskBoard({
      version: 3,
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
          version: 3,
          updatedAt: timestamp,
          items: [task("first", "todo", 0), task("gap", "todo", 2)],
        }),
      /sequential/,
    );
  });

  test("normalizes implementation notes and strict image/link evidence", () => {
    assert.deepEqual(
      validateTaskChanges({
        implementationNotes: "  Verified in local Mailpit.  ",
        evidence: [
          {
            kind: "image",
            label: "  OTP screen  ",
            path: "passwordless-auth/2026-08-20-otp.png",
          },
          {
            kind: "link",
            label: "  Passing checks  ",
            url: "https://github.com/example/project/actions/runs/123#summary",
          },
        ],
      }),
      {
        implementationNotes: "Verified in local Mailpit.",
        evidence: [
          {
            kind: "image",
            label: "OTP screen",
            path: "passwordless-auth/2026-08-20-otp.png",
          },
          {
            kind: "link",
            label: "Passing checks",
            url: "https://github.com/example/project/actions/runs/123#summary",
          },
        ],
      },
    );
  });

  test("rejects unsafe, malformed, duplicate, and excessive evidence", () => {
    const image = (imagePath) => ({
      kind: "image",
      label: "Screenshot",
      path: imagePath,
    });
    for (const imagePath of [
      "../secret.png",
      "/absolute/secret.png",
      "task/../secret.png",
      "task\\secret.png",
      "task/%2e%2e.png",
      "task/proof.svg",
      "Task/proof.png",
      "task/nested/proof.png",
    ]) {
      assert.throws(
        () => validateTaskChanges({ evidence: [image(imagePath)] }),
        InputError,
      );
    }

    for (const url of [
      "http://example.com/proof",
      "javascript:alert(1)",
      "data:text/plain,proof",
      "https://user:password@example.com/proof",
      "https://example.com/proof?token=secret",
    ]) {
      assert.throws(
        () =>
          validateTaskChanges({
            evidence: [{ kind: "link", label: "Proof", url }],
          }),
        InputError,
      );
    }

    assert.throws(
      () =>
        validateTaskChanges({
          evidence: [image("task/proof.png"), image("task/proof.png")],
        }),
      /duplicate/,
    );
    assert.throws(
      () =>
        validateTaskChanges({
          evidence: Array.from({ length: 11 }, (_, index) =>
            image(`task/proof-${index}.png`),
          ),
        }),
      /at most 10/,
    );
    assert.throws(
      () =>
        validateTaskChanges({
          evidence: [
            {
              kind: "image",
              label: "Proof",
              path: "task/proof.png",
              rawHtml: "<script />",
            },
          ],
        }),
      /unsupported fields/,
    );
    assert.throws(
      () =>
        validateTaskChanges({
          implementationNotes:
            "Stored token_hash=do-not-store-sign-in-token-value",
        }),
      /credential or sign-in token/,
    );
  });

  test("resolves evidence images only inside the dedicated directory", () => {
    const evidenceDirectory = path.join(os.tmpdir(), "bare-traen-evidence");
    assert.equal(
      resolveEvidenceImagePath(
        evidenceDirectory,
        "task-id/2026-08-20-proof.webp",
      ),
      path.join(evidenceDirectory, "task-id", "2026-08-20-proof.webp"),
    );
    assert.throws(
      () => resolveEvidenceImagePath(evidenceDirectory, "../outside.png"),
      InputError,
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
