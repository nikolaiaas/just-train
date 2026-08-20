import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { ServiceManager } from "../server/service-manager.mjs";

function verifiedInspection(mode, { sharedPid = null } = {}) {
  return {
    listening: true,
    ownership: "verified-repository",
    stoppable: true,
    mode,
    targets: [
      {
        pid: mode === "admin" ? 101 : 201,
        ppid: 90,
        command: `verified ${mode}`,
        cwd: "/repo",
        kind: mode,
      },
    ],
    sharedTargets:
      sharedPid === null
        ? []
        : [
            {
              pid: sharedPid,
              ppid: 1,
              command: "verified shared-web",
              cwd: "/repo",
              kind: "shared-web",
            },
          ],
  };
}

describe("ServiceManager external ownership", () => {
  test("reports only the active mode on shared port 11001", async () => {
    const manager = new ServiceManager({
      repositoryRoot: "/repo",
      portProbe: async (port) => port === 11001,
      processInspector: {
        inspectPort: async () => verifiedInspection("mobile-web"),
      },
    });

    const states = await manager.getServiceStates();
    assert.equal(states.mobileWeb.status, "external");
    assert.equal(states.mobileWeb.stoppable, true);
    assert.equal(states.mobileWeb.ownership, "verified-repository");
    assert.equal(states.iphoneMetro.status, "stopped");
    assert.equal(states.iphoneMetro.stoppable, false);
    assert.equal(states.iphoneMetro.ownership, "none");
    assert.equal(states.iphoneMetro.portConflict, true);
    for (const state of Object.values(states)) {
      assert.equal(Object.hasOwn(state, "pid"), false);
      assert.equal(Object.hasOwn(state, "command"), false);
      assert.equal(Object.hasOwn(state, "cwd"), false);
    }
  });

  test("stops a revalidated repository service but refuses an unknown listener", async () => {
    let running = true;
    const signals = [];
    const inspector = {
      inspectPort: async () => verifiedInspection("mobile-web"),
      terminateVerified: async (inspection, signal) => {
        signals.push([inspection.mode, signal]);
        running = false;
        return 1;
      },
    };
    const manager = new ServiceManager({
      repositoryRoot: "/repo",
      portProbe: async (port) => port === 11001 && running,
      processInspector: inspector,
      gracefulStopMilliseconds: 0,
      forceStopMilliseconds: 0,
    });

    await manager.stop("mobileWeb");
    assert.deepEqual(signals, [["mobile-web", "SIGTERM"]]);

    const protectedManager = new ServiceManager({
      repositoryRoot: "/repo",
      portProbe: async (port) => port === 11000,
      processInspector: {
        inspectPort: async () => ({
          listening: true,
          ownership: "unknown",
          stoppable: false,
          mode: null,
          targets: [],
          sharedTargets: [],
        }),
      },
    });
    await assert.rejects(
      () => protectedManager.stop("admin"),
      (error) => {
        assert.equal(error.code, "service_conflict");
        assert.match(error.message, /will not stop/i);
        return true;
      },
    );
  });

  test("restarts a sibling dropped by shared dev:web only for per-service stop", async () => {
    const ports = new Map([
      [11000, true],
      [11001, true],
    ]);
    const inspector = {
      inspectPort: async (port) =>
        port === 11000
          ? verifiedInspection("admin", { sharedPid: 50 })
          : verifiedInspection("mobile-web", { sharedPid: 50 }),
      terminateVerified: async (inspection) => {
        assert.equal(inspection.mode, "admin");
        ports.set(11000, false);
        ports.set(11001, false);
        return 1;
      },
    };
    const manager = new ServiceManager({
      repositoryRoot: "/repo",
      portProbe: async (port) => ports.get(port) ?? false,
      processInspector: inspector,
      gracefulStopMilliseconds: 0,
      forceStopMilliseconds: 0,
      sharedSiblingSettleMilliseconds: 0,
    });
    const restarted = [];
    manager.start = async (serviceId) => {
      restarted.push(serviceId);
      if (serviceId === "mobileWeb") ports.set(11001, true);
    };

    await manager.stop("admin");
    assert.deepEqual(restarted, ["mobileWeb"]);
    assert.equal(ports.get(11001), true);
  });

  test("aggregate stop leaves verified services stopped and never restarts the sibling", async () => {
    const ports = new Map([
      [11000, true],
      [11001, true],
    ]);
    const inspector = {
      inspectPort: async (port) =>
        port === 11000
          ? verifiedInspection("admin", { sharedPid: 50 })
          : verifiedInspection("mobile-web", { sharedPid: 50 }),
      terminateVerified: async () => {
        ports.set(11000, false);
        ports.set(11001, false);
        return 1;
      },
    };
    const manager = new ServiceManager({
      repositoryRoot: "/repo",
      portProbe: async (port) => ports.get(port) ?? false,
      processInspector: inspector,
      gracefulStopMilliseconds: 0,
      forceStopMilliseconds: 0,
      sharedSiblingSettleMilliseconds: 0,
    });
    const restarted = [];
    manager.start = async (serviceId) => restarted.push(serviceId);
    manager.stopSupabase = async () => undefined;

    await manager.stopMyApps();
    assert.deepEqual(restarted, []);
    assert.equal(ports.get(11000), false);
    assert.equal(ports.get(11001), false);
  });

  test("aggregate stop leaves an unknown port occupant protected", async () => {
    let terminateCalls = 0;
    const manager = new ServiceManager({
      repositoryRoot: "/repo",
      portProbe: async (port) => port === 11000,
      processInspector: {
        inspectPort: async () => ({
          listening: true,
          ownership: "unknown",
          stoppable: false,
          mode: null,
          targets: [],
          sharedTargets: [],
        }),
        terminateVerified: async () => {
          terminateCalls += 1;
          return 0;
        },
      },
    });
    manager.stopSupabase = async () => undefined;

    await manager.stopMyApps();
    assert.equal(terminateCalls, 0);
    assert.match(
      manager.getLogs().admin.at(-1).text,
      /Protected an unverified process/,
    );
  });
});
