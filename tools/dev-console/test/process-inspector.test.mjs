import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";

import {
  classifyProcessChain,
  parseProcessRecord,
  ProcessInspector,
} from "../server/process-inspector.mjs";

const repositoryRoot = "/work/Bare Træn";

function record(pid, ppid, command, cwd) {
  return { pid, ppid, pgid: 100, command, cwd };
}

describe("process ownership classification", () => {
  test("selects a service branch without climbing to its shared dev:web wrapper", () => {
    const chain = [
      record(104, 103, "next-server (v16.3.1)", `${repositoryRoot}/apps/admin`),
      record(
        103,
        102,
        `node ${repositoryRoot}/apps/admin/node_modules/next/dist/bin/next dev --port 11000`,
        `${repositoryRoot}/apps/admin`,
      ),
      record(
        102,
        101,
        "node /node/bin/pnpm --filter @bare-traen/admin dev",
        repositoryRoot,
      ),
      record(
        101,
        100,
        "node /repo/concurrently.js child commands",
        repositoryRoot,
      ),
      record(100, 1, "node /node/bin/pnpm dev:web", repositoryRoot),
    ];

    const result = classifyProcessChain(chain, {
      repositoryRoot,
      serviceId: "admin",
    });
    assert.equal(result.verified, true);
    assert.equal(result.target.pid, 102);
    assert.equal(result.target.kind, "admin");
    assert.equal(result.sharedTarget.pid, 100);
    assert.equal(result.sharedTarget.kind, "shared-web");
  });

  test("rejects lookalike commands outside the repository and unknown commands inside it", () => {
    assert.equal(
      classifyProcessChain(
        [record(20, 1, "node /node/bin/pnpm dev:admin", "/work/Other")],
        { repositoryRoot, serviceId: "admin" },
      ).verified,
      false,
    );
    assert.equal(
      classifyProcessChain(
        [
          record(
            21,
            1,
            "node ./unrelated-server.js --port 11000",
            repositoryRoot,
          ),
        ],
        { repositoryRoot, serviceId: "admin" },
      ).verified,
      false,
    );
  });

  test("parses fixed ps and cwd responses", () => {
    assert.deepEqual(
      parseProcessRecord(
        "  42  40  40 node /node/bin/pnpm dev:web\n",
        `p42\nfcwd\nn${repositoryRoot}\n`,
      ),
      {
        pid: 42,
        ppid: 40,
        pgid: 40,
        command: "node /node/bin/pnpm dev:web",
        cwd: repositoryRoot,
      },
    );
  });
});

describe("ProcessInspector fixed-command verification", () => {
  test("verifies Expo web mode, records the shared wrapper, and revalidates before signal", async () => {
    const processes = new Map([
      [
        204,
        record(
          204,
          203,
          "node ./node_modules/.bin/../expo/bin/cli start --web --lan --port 11001",
          `${repositoryRoot}/apps/mobile`,
        ),
      ],
      [
        203,
        record(
          203,
          202,
          "node /node/bin/pnpm --filter @bare-traen/mobile exec expo start --web --lan --port 11001",
          repositoryRoot,
        ),
      ],
      [202, record(202, 201, "node /repo/concurrently.js", repositoryRoot)],
      [201, record(201, 1, "node /node/bin/pnpm dev:web", repositoryRoot)],
    ]);
    const calls = [];
    const signals = [];
    const runFile = async (file, args) => {
      calls.push([file, ...args]);
      if (file === "lsof" && args.includes("-iTCP:11001")) {
        return { stdout: "204\n" };
      }
      const pidFlag = args.indexOf("-p");
      const pid = Number(args[pidFlag + 1]);
      const processRecord = processes.get(pid);
      if (!processRecord) throw new Error("missing process");
      if (file === "ps") {
        return {
          stdout: `${processRecord.pid} ${processRecord.ppid} ${processRecord.pgid} ${processRecord.command}\n`,
        };
      }
      return { stdout: `p${pid}\nfcwd\nn${processRecord.cwd}\n` };
    };
    const inspector = new ProcessInspector({
      repositoryRoot,
      runFile,
      signalProcess: (pid, signal) => signals.push([pid, signal]),
      cacheMilliseconds: 0,
    });

    const inspection = await inspector.inspectPort(11001, "mobileWeb", {
      fresh: true,
    });
    assert.equal(inspection.ownership, "verified-repository");
    assert.equal(inspection.stoppable, true);
    assert.equal(inspection.mode, "mobile-web");
    assert.deepEqual(
      inspection.targets.map((target) => target.pid),
      [203],
    );
    assert.deepEqual(
      inspection.sharedTargets.map((target) => target.pid),
      [201],
    );

    assert.equal(await inspector.terminateVerified(inspection, "SIGTERM"), 1);
    assert.deepEqual(signals, [[203, "SIGTERM"]]);
    assert.ok(calls.every((call) => !call.join(" ").includes("env")));

    processes.set(
      203,
      record(
        203,
        202,
        "node ./unrelated-server.js",
        path.join(repositoryRoot, "apps"),
      ),
    );
    assert.equal(await inspector.terminateVerified(inspection, "SIGKILL"), 0);
    assert.deepEqual(signals, [[203, "SIGTERM"]]);
  });
});
