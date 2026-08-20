import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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
  await mkdir(publicDirectory);
  await writeFile(
    path.join(publicDirectory, "index.html"),
    "<!doctype html><p>Console</p>",
  );
  await writeFile(
    path.join(publicDirectory, "app.js"),
    "console.log('console');\n",
  );

  const performed = [];
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
    taskFile: path.join(directory, "tasks.json"),
    manager,
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
  assert.equal(state.tasks.version, 2);
  assert.deepEqual(state.tasks.items, []);

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
