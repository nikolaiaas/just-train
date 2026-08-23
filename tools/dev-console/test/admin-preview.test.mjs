import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, test } from "node:test";

import {
  isAdminPreviewReady,
  monitorAdminPreview,
  runAdminPreviewCommand,
  startAdminPreview,
  waitForAdminPreview,
} from "../server/admin-preview.mjs";

function adminState(overrides = {}) {
  return {
    id: "admin",
    label: "Administration",
    status: "stopped",
    managed: false,
    stoppable: false,
    ownership: "none",
    portConflict: false,
    port: 11000,
    url: "http://localhost:11000",
    detail: null,
    lastError: null,
    ...overrides,
  };
}

function fakeManager(initialState) {
  const calls = [];
  let state = initialState;
  return {
    calls,
    async getServiceStates() {
      calls.push("state");
      return { admin: state };
    },
    async shutdown() {
      calls.push("shutdown");
    },
    async start(serviceId) {
      calls.push(`start:${serviceId}`);
      state = adminState({
        status: "running",
        managed: true,
        stoppable: true,
        ownership: "console",
      });
    },
    async stop(serviceId) {
      calls.push(`stop:${serviceId}`);
      state = adminState();
    },
  };
}

describe("ChatGPT admin preview command", () => {
  test("recognizes a redirect as a ready preview", async () => {
    const ready = await isAdminPreviewReady({
      fetchImpl: async (_url, options) => {
        assert.equal(options.method, "HEAD");
        assert.equal(options.redirect, "manual");
        return { status: 307 };
      },
    });
    assert.equal(ready, true);
  });

  test("does not recognize an HTTP server error as ready", async () => {
    const ready = await isAdminPreviewReady({
      fetchImpl: async () => ({ status: 500 }),
    });
    assert.equal(ready, false);
  });

  test("reports a failed or timed out request as not ready", async () => {
    const ready = await isAdminPreviewReady({
      fetchImpl: async () => {
        throw new Error("connection failed");
      },
    });
    assert.equal(ready, false);
  });

  test("reuses a responsive verified preview without claiming it", async () => {
    const manager = fakeManager(
      adminState({
        status: "external",
        stoppable: true,
        ownership: "verified-repository",
        portConflict: true,
      }),
    );
    const result = await startAdminPreview({
      manager,
      probe: async () => true,
      waitForReady: async () => true,
    });

    assert.deepEqual(result, {
      managed: false,
      restarted: false,
      reused: true,
    });
    assert.deepEqual(manager.calls, ["state", "state"]);
  });

  test("safely restarts a verified preview that does not answer HTTP", async () => {
    const manager = fakeManager(
      adminState({
        status: "external",
        stoppable: true,
        ownership: "verified-repository",
        portConflict: true,
      }),
    );
    const readiness = [false, true];
    const result = await startAdminPreview({
      manager,
      probe: async () => true,
      waitForReady: async () => readiness.shift(),
    });

    assert.deepEqual(result, {
      managed: true,
      restarted: true,
      reused: false,
    });
    assert.deepEqual(manager.calls, [
      "state",
      "state",
      "stop:admin",
      "start:admin",
      "state",
    ]);
  });

  test("does not stop an existing preview when cancellation wins the state race", async () => {
    const calls = [];
    let cancelled = false;
    let stateRead = 0;
    const existingState = adminState({
      status: "external",
      stoppable: true,
      ownership: "verified-repository",
      portConflict: true,
    });
    const manager = {
      async getServiceStates() {
        calls.push("state");
        stateRead += 1;
        if (stateRead === 2) cancelled = true;
        return { admin: existingState };
      },
      async start() {
        calls.push("start:admin");
      },
      async stop() {
        calls.push("stop:admin");
      },
    };

    await assert.rejects(
      () =>
        startAdminPreview({
          isCancelled: () => cancelled,
          manager,
          waitForReady: async () => false,
        }),
      /cancelled/i,
    );
    assert.deepEqual(calls, ["state", "state"]);
  });

  test("reuses a verified preview started concurrently by the console", async () => {
    const calls = [];
    let state = adminState();
    const manager = {
      async getServiceStates() {
        calls.push("state");
        return { admin: state };
      },
      async shutdown() {
        calls.push("shutdown");
      },
      async start() {
        calls.push("start:admin");
        state = adminState({
          status: "external",
          stoppable: true,
          ownership: "verified-repository",
          portConflict: true,
        });
      },
    };

    const result = await startAdminPreview({
      manager,
      probe: async () => true,
      waitForReady: async () => true,
    });

    assert.deepEqual(result, {
      managed: false,
      restarted: false,
      reused: true,
    });
    assert.deepEqual(calls, ["state", "start:admin", "state"]);
  });

  test("stops a newly managed preview when startup never becomes ready", async () => {
    const manager = fakeManager(adminState());
    await assert.rejects(
      () =>
        startAdminPreview({
          manager,
          waitForReady: async () => false,
        }),
      /did not become ready/i,
    );
    assert.deepEqual(manager.calls, ["state", "start:admin", "shutdown"]);
  });

  test("cleans up when the preview exits after passing readiness", async () => {
    const calls = [];
    let stateRead = 0;
    const manager = {
      async getServiceStates() {
        calls.push("state");
        stateRead += 1;
        return {
          admin:
            stateRead === 1
              ? adminState()
              : adminState({ status: "error", managed: false }),
        };
      },
      async shutdown() {
        calls.push("shutdown");
      },
      async start() {
        calls.push("start:admin");
      },
    };

    await assert.rejects(
      () =>
        startAdminPreview({
          manager,
          probe: async () => true,
          waitForReady: async () => true,
        }),
      /did not remain ready/i,
    );
    assert.deepEqual(calls, ["state", "start:admin", "state", "shutdown"]);
  });

  test("waits until a probe becomes ready", async () => {
    let attempts = 0;
    const ready = await waitForAdminPreview({
      intervalMs: 1,
      timeoutMs: 50,
      probe: async () => {
        attempts += 1;
        return attempts === 2;
      },
    });
    assert.equal(ready, true);
    assert.equal(attempts, 2);
  });

  test("monitoring fails when a managed preview later stops", async () => {
    let stateRead = 0;
    const manager = {
      async getServiceStates() {
        stateRead += 1;
        return {
          admin:
            stateRead === 1
              ? adminState({ status: "running", managed: true })
              : adminState({ status: "error", managed: false }),
        };
      },
    };

    await assert.rejects(
      () => monitorAdminPreview({ intervalMs: 0, manager }),
      /stopped unexpectedly/i,
    );
    assert.equal(stateRead, 2);
  });

  test("the command cleans up and fails if the preview later exits", async () => {
    const calls = [];
    const signalTarget = new EventEmitter();
    const manager = {
      async shutdown() {
        calls.push("shutdown");
      },
    };

    await assert.rejects(
      () =>
        runAdminPreviewCommand({
          manager,
          monitor: async () => {
            calls.push("monitor");
            throw new Error("Administration stopped unexpectedly.");
          },
          signalTarget,
          start: async () => ({ managed: true }),
          write: () => calls.push("write"),
        }),
      /stopped unexpectedly/i,
    );
    assert.deepEqual(calls, ["write", "monitor", "shutdown"]);
    assert.equal(signalTarget.listenerCount("SIGINT"), 0);
    assert.equal(signalTarget.listenerCount("SIGTERM"), 0);
  });

  test("a signal during startup cancels and cleans up the preview", async () => {
    const calls = [];
    const signalTarget = new EventEmitter();
    const manager = {
      async shutdown() {
        calls.push("shutdown");
      },
    };

    const result = await runAdminPreviewCommand({
      manager,
      signalTarget,
      start: async ({ isCancelled }) => {
        await new Promise((resolve) => {
          setImmediate(() => {
            signalTarget.emit("SIGINT");
            resolve();
          });
        });
        assert.equal(isCancelled(), true);
        throw new Error("startup interrupted");
      },
      write: () => calls.push("write"),
    });

    assert.deepEqual(result, { cancelled: true });
    assert.deepEqual(calls, ["shutdown"]);
    assert.equal(signalTarget.listenerCount("SIGINT"), 0);
    assert.equal(signalTarget.listenerCount("SIGTERM"), 0);
  });

  test("signal protection remains installed until shutdown completes", async () => {
    const signalTarget = new EventEmitter();
    let finishShutdown;
    let markShutdownStarted;
    const shutdownStarted = new Promise((resolve) => {
      markShutdownStarted = resolve;
    });
    const manager = {
      async shutdown() {
        markShutdownStarted();
        await new Promise((resolve) => {
          finishShutdown = resolve;
        });
      },
    };

    const command = runAdminPreviewCommand({
      manager,
      signalTarget,
      start: async () => ({ managed: false }),
      write: () => undefined,
    });
    await shutdownStarted;

    assert.equal(signalTarget.listenerCount("SIGINT"), 1);
    assert.equal(signalTarget.listenerCount("SIGTERM"), 1);
    signalTarget.emit("SIGINT");
    signalTarget.emit("SIGINT");
    signalTarget.emit("SIGTERM");
    assert.equal(signalTarget.listenerCount("SIGINT"), 1);
    assert.equal(signalTarget.listenerCount("SIGTERM"), 1);

    finishShutdown();
    await command;
    assert.equal(signalTarget.listenerCount("SIGINT"), 0);
    assert.equal(signalTarget.listenerCount("SIGTERM"), 0);
  });
});
