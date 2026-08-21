import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import {
  createDevConsole,
  DEV_CONSOLE_APP_ID,
  repositoryIdentity,
} from "../server/index.mjs";

const temporaryDirectories = [];
const runningApps = [];

afterEach(async () => {
  await Promise.all(runningApps.splice(0).map((app) => app.close()));
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function fakeServiceState(id) {
  return {
    id,
    label: id,
    status: "stopped",
    managed: false,
    port: null,
    url: null,
    detail: null,
    lastError: null,
  };
}

test("derives a deterministic non-secret checkout identity", () => {
  const first = repositoryIdentity("/tmp/checkout-one");
  assert.equal(first, repositoryIdentity("/tmp/checkout-one"));
  assert.notEqual(first, repositoryIdentity("/tmp/checkout-two"));
  assert.match(first, /^[a-f0-9]{16}$/);
  assert.equal(first.includes("checkout"), false);
});

test("serves local state and requires same-origin CSRF protection for actions", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "bare-traen-console-http-"),
  );
  temporaryDirectories.push(directory);
  const publicDirectory = path.join(directory, "public");
  const evidenceDirectory = path.join(directory, "evidence");
  await mkdir(publicDirectory);
  await mkdir(path.join(evidenceDirectory, "passwordless-auth"), {
    recursive: true,
  });
  await writeFile(
    path.join(publicDirectory, "index.html"),
    "<!doctype html><p>Console</p>",
  );
  await writeFile(
    path.join(publicDirectory, "app.js"),
    "console.log('console');\n",
  );
  const pngSignature = Buffer.from("89504e470d0a1a0a", "hex");
  await writeFile(
    path.join(evidenceDirectory, "passwordless-auth", "2026-08-20-otp.png"),
    pngSignature,
  );
  await writeFile(
    path.join(evidenceDirectory, "passwordless-auth", "not-an-image.png"),
    "not an image",
  );
  const outsideImage = path.join(directory, "outside.png");
  await writeFile(outsideImage, pngSignature);
  await symlink(
    outsideImage,
    path.join(evidenceDirectory, "passwordless-auth", "outside-link.png"),
  );

  const performed = [];
  const previewActions = [];
  const iphonePreviewState = {
    status: "needs-build",
    message: "A fresh build is needed.",
    version: "1.2.0",
    checkedAt: "2026-08-21T19:00:00.000Z",
  };
  const iphonePreviewManager = {
    getState: () => ({ ...iphonePreviewState }),
    initialize: async () => undefined,
    shutdown: async () => undefined,
    prepare: async () => previewActions.push("prepare"),
    refresh: async () => previewActions.push("refresh"),
  };
  const manager = {
    initialize: async () => undefined,
    shutdown: async () => undefined,
    getServiceStates: async () => ({
      admin: fakeServiceState("admin"),
      mobileWeb: fakeServiceState("mobileWeb"),
      iphoneMetro: fakeServiceState("iphoneMetro"),
      supabase: fakeServiceState("supabase"),
    }),
    getLogs: () => ({
      admin: [],
      mobileWeb: [],
      iphoneMetro: [],
      supabase: [],
    }),
    perform: async (action) => performed.push(action),
  };
  const port = await reservePort();
  const app = createDevConsole({
    port,
    repositoryRoot: directory,
    publicDirectory,
    evidenceDirectory,
    taskFile: path.join(directory, "tasks.json"),
    manager,
    iphonePreviewManager,
  });
  runningApps.push(app);
  await app.listen();

  const pageResponse = await fetch(app.consoleUrl);
  assert.equal(pageResponse.status, 200);
  assert.match(await pageResponse.text(), /Console/);
  assert.match(
    pageResponse.headers.get("content-security-policy"),
    /default-src 'self'/,
  );

  const healthResponse = await fetch(`${app.consoleUrl}/api/health`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), {
    ok: true,
    app: DEV_CONSOLE_APP_ID,
    repositoryId: repositoryIdentity(directory),
  });

  for (const route of ["/services", "/tasks"]) {
    const routeResponse = await fetch(`${app.consoleUrl}${route}`);
    assert.equal(routeResponse.status, 200);
    assert.match(await routeResponse.text(), /Console/);
  }
  const headResponse = await fetch(`${app.consoleUrl}/tasks`, {
    method: "HEAD",
  });
  assert.equal(headResponse.status, 200);
  assert.equal(await headResponse.text(), "");
  const assetResponse = await fetch(`${app.consoleUrl}/app.js`);
  assert.equal(assetResponse.status, 200);
  assert.match(await assetResponse.text(), /console\.log/);
  const unknownRoute = await fetch(`${app.consoleUrl}/not-a-route`);
  assert.equal(unknownRoute.status, 404);
  const unknownApi = await fetch(`${app.consoleUrl}/api/not-a-route`);
  assert.equal(unknownApi.status, 404);

  const stateResponse = await fetch(`${app.consoleUrl}/api/state`);
  assert.equal(stateResponse.status, 200);
  const state = await stateResponse.json();
  assert.equal(typeof state.csrfToken, "string");
  assert.deepEqual(state.iphonePreview, iphonePreviewState);
  assert.equal(state.tasks.version, 3);
  assert.deepEqual(state.tasks.items, []);

  const evidenceResponse = await fetch(
    `${app.consoleUrl}/api/evidence/passwordless-auth/2026-08-20-otp.png`,
  );
  assert.equal(evidenceResponse.status, 200);
  assert.equal(evidenceResponse.headers.get("content-type"), "image/png");
  assert.equal(
    evidenceResponse.headers.get("cross-origin-resource-policy"),
    "same-origin",
  );
  assert.deepEqual(
    Buffer.from(await evidenceResponse.arrayBuffer()),
    pngSignature,
  );

  const evidenceHead = await fetch(
    `${app.consoleUrl}/api/evidence/passwordless-auth/2026-08-20-otp.png`,
    { method: "HEAD" },
  );
  assert.equal(evidenceHead.status, 200);
  assert.equal(await evidenceHead.text(), "");

  for (const [evidencePath, expectedStatus] of [
    ["passwordless-auth/missing.png", 404],
    ["passwordless-auth/not-an-image.png", 415],
    ["passwordless-auth/outside-link.png", 403],
    ["passwordless-auth/proof.svg", 400],
    ["passwordless-auth/%252e%252e.png", 400],
  ]) {
    const response = await fetch(
      `${app.consoleUrl}/api/evidence/${evidencePath}`,
    );
    assert.equal(response.status, expectedStatus, evidencePath);
  }
  const evidenceWithQuery = await fetch(
    `${app.consoleUrl}/api/evidence/passwordless-auth/2026-08-20-otp.png?token=nope`,
  );
  assert.equal(evidenceWithQuery.status, 400);

  const rejected = await fetch(`${app.consoleUrl}/api/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "refresh" }),
  });
  assert.equal(rejected.status, 403);

  const accepted = await fetch(`${app.consoleUrl}/api/actions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: app.consoleUrl,
      "X-CSRF-Token": state.csrfToken,
    },
    body: JSON.stringify({ action: "start", service: "admin" }),
  });
  assert.equal(accepted.status, 200);
  assert.deepEqual(performed, [{ action: "start", service: "admin" }]);

  const prepared = await fetch(`${app.consoleUrl}/api/actions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: app.consoleUrl,
      "X-CSRF-Token": state.csrfToken,
    },
    body: JSON.stringify({ action: "prepare-iphone-preview" }),
  });
  assert.equal(prepared.status, 200);
  assert.deepEqual(previewActions, ["prepare"]);
  assert.deepEqual(performed, [{ action: "start", service: "admin" }]);

  const arbitraryCommand = await fetch(`${app.consoleUrl}/api/actions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: app.consoleUrl,
      "X-CSRF-Token": state.csrfToken,
    },
    body: JSON.stringify({ action: "run", command: "anything" }),
  });
  assert.equal(arbitraryCommand.status, 400);
  assert.deepEqual(performed, [{ action: "start", service: "admin" }]);

  const createdResponse = await fetch(`${app.consoleUrl}/api/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: app.consoleUrl,
      "X-CSRF-Token": state.csrfToken,
    },
    body: JSON.stringify({
      action: "create",
      task: {
        title: "Verify the console",
        details: "Synthetic task",
        status: "todo",
      },
    }),
  });
  assert.equal(createdResponse.status, 200);
  const created = await createdResponse.json();
  assert.equal(created.tasks.items.length, 1);
  const taskId = created.tasks.items[0].id;
  assert.equal(created.tasks.items[0].priority, 0);
  assert.equal(created.tasks.items[0].implementationNotes, "");
  assert.deepEqual(created.tasks.items[0].evidence, []);

  const documentedResponse = await fetch(`${app.consoleUrl}/api/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: app.consoleUrl,
      "X-CSRF-Token": state.csrfToken,
    },
    body: JSON.stringify({
      action: "update",
      id: taskId,
      changes: {
        implementationNotes: "Verified with a synthetic email.",
        evidence: [
          {
            kind: "image",
            label: "OTP screen",
            path: "passwordless-auth/2026-08-20-otp.png",
          },
          {
            kind: "link",
            label: "Passing checks",
            url: "https://github.com/example/project/actions/runs/123",
          },
        ],
      },
    }),
  });
  assert.equal(documentedResponse.status, 200);
  const documented = await documentedResponse.json();
  assert.equal(
    documented.tasks.items[0].implementationNotes,
    "Verified with a synthetic email.",
  );
  assert.equal(documented.tasks.items[0].evidence.length, 2);

  const secondCreatedResponse = await fetch(`${app.consoleUrl}/api/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: app.consoleUrl,
      "X-CSRF-Token": state.csrfToken,
    },
    body: JSON.stringify({
      action: "create",
      task: {
        title: "Second task",
        details: "Synthetic task",
        status: "todo",
      },
    }),
  });
  assert.equal(secondCreatedResponse.status, 200);
  const secondCreated = await secondCreatedResponse.json();
  const secondTaskId = secondCreated.tasks.items.find(
    (task) => task.id !== taskId,
  ).id;
  assert.deepEqual(
    secondCreated.tasks.items.map((task) => task.priority),
    [0, 1],
  );

  const movedResponse = await fetch(
    `${app.consoleUrl}/api/tasks/${encodeURIComponent(taskId)}/status`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: app.consoleUrl,
        "X-CSRF-Token": state.csrfToken,
      },
      body: JSON.stringify({ status: "doing" }),
    },
  );
  assert.equal(movedResponse.status, 200);
  const moved = await movedResponse.json();
  assert.equal(
    moved.tasks.items.find((task) => task.id === taskId).status,
    "doing",
  );
  assert.equal(
    moved.tasks.items.find((task) => task.id === taskId).evidence.length,
    2,
  );
  assert.equal(
    moved.tasks.items.find((task) => task.id === secondTaskId).priority,
    0,
  );

  const rejectedReorder = await fetch(`${app.consoleUrl}/api/tasks/reorder`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: app.consoleUrl,
    },
    body: JSON.stringify({
      taskId: secondTaskId,
      status: "doing",
      beforeTaskId: taskId,
    }),
  });
  assert.equal(rejectedReorder.status, 403);

  const reorderedResponse = await fetch(`${app.consoleUrl}/api/tasks/reorder`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: app.consoleUrl,
      "X-CSRF-Token": state.csrfToken,
    },
    body: JSON.stringify({
      taskId: secondTaskId,
      status: "doing",
      beforeTaskId: taskId,
    }),
  });
  assert.equal(reorderedResponse.status, 200);
  const reordered = await reorderedResponse.json();
  assert.deepEqual(
    reordered.tasks.items
      .filter((task) => task.status === "doing")
      .map(({ id, priority }) => [id, priority]),
    [
      [secondTaskId, 0],
      [taskId, 1],
    ],
  );

  const extraReorderField = await fetch(`${app.consoleUrl}/api/tasks/reorder`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: app.consoleUrl,
      "X-CSRF-Token": state.csrfToken,
    },
    body: JSON.stringify({
      taskId: secondTaskId,
      status: "doing",
      beforeTaskId: null,
      command: "anything",
    }),
  });
  assert.equal(extraReorderField.status, 400);

  const legacyStatus = await fetch(
    `${app.consoleUrl}/api/tasks/${encodeURIComponent(taskId)}/status`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: app.consoleUrl,
        "X-CSRF-Token": state.csrfToken,
      },
      body: JSON.stringify({ status: "in-progress" }),
    },
  );
  assert.equal(legacyStatus.status, 400);
});
