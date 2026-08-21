import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  IPHONE_PREVIEW_TEST_CONSTANTS,
  IphonePreviewManager,
  MOBILE_BUILD_INPUT_PATHS,
  openCanonicalBuildPage,
  parseEasBuildList,
} from "../server/iphone-preview-manager.mjs";

const HEAD = "a".repeat(40);
const PREVIOUS_HEAD = "b".repeat(40);
const BUILD_ID = "514db820-0eab-43cf-b8ed-65d23978bebd";
const NOW = new Date("2026-08-21T19:30:00.000Z");

function easBuild({
  id = BUILD_ID,
  status = "FINISHED",
  commit = HEAD,
  profile = "preview",
  channel = "preview",
  distribution = "INTERNAL",
  identifier = "dk.baretraen.app.preview",
  platform = "IOS",
  simulator = false,
  completedAt = "2026-08-21T19:12:34.197Z",
  expirationDate = "2026-09-04T19:06:42.013Z",
} = {}) {
  return {
    id,
    status,
    platform,
    distribution,
    buildProfile: profile,
    appIdentifier: identifier,
    isForIosSimulator: simulator,
    updateChannel: { name: channel },
    appVersion: "1.2.0",
    gitCommitHash: commit,
    createdAt: "2026-08-21T19:06:41.982Z",
    completedAt: status === "FINISHED" ? completedAt : null,
    expirationDate,
    app: {
      id: IPHONE_PREVIEW_TEST_CONSTANTS.expoProjectId,
      slug: "bare-traen",
      ownerAccount: { name: "bare-traen" },
    },
    artifacts: {
      buildUrl: "https://signed-artifact.example.test/private.ipa?secret=yes",
    },
    logFiles: ["https://signed-logs.example.test/private?secret=yes"],
  };
}

function fakeEnvironment({
  builds = [easBuild()],
  dirty = false,
  inputsMatch = true,
  startCode = 0,
  startedBuild = easBuild({ status: "NEW" }),
} = {}) {
  const calls = [];
  let listedBuilds = builds;
  const runner = async (file, args, options) => {
    calls.push({ file, args: [...args], options: { ...options } });
    if (file === "git" && args[0] === "rev-parse") {
      return { code: 0, stdout: `${HEAD}\n` };
    }
    if (file === "git" && args[0] === "show") {
      return {
        code: 0,
        stdout: JSON.stringify({ expo: { version: "1.2.0" } }),
      };
    }
    if (file === "git" && args[0] === "status") {
      return {
        code: 0,
        stdout: dirty ? " M apps/mobile/src/app/index.tsx\n" : "",
      };
    }
    if (file === "git" && args[0] === "diff") {
      return { code: inputsMatch ? 0 : 1, stdout: "" };
    }
    if (file === "mise" && args.includes("build:list")) {
      return { code: 0, stdout: JSON.stringify(listedBuilds) };
    }
    if (file === "mise" && args.includes("build")) {
      return { code: startCode, stdout: JSON.stringify([startedBuild]) };
    }
    throw new Error(`Unexpected command: ${file} ${args.join(" ")}`);
  };
  return {
    calls,
    runner,
    setBuilds(next) {
      listedBuilds = next;
    },
  };
}

function createManager(environment, options = {}) {
  return new IphonePreviewManager({
    repositoryRoot: "/repo",
    runner: environment.runner,
    clock: () => NOW,
    setTimer: options.setTimer ?? (() => ({ unref() {} })),
    clearTimer: options.clearTimer ?? (() => undefined),
    opener: options.opener ?? (async () => undefined),
    cacheMilliseconds: 0,
    pollMilliseconds: 1,
    submissionGraceMilliseconds: 90_000,
  });
}

describe("iPhone preview build parsing", () => {
  test("keeps only validated non-secret build fields", () => {
    const [parsed] = parseEasBuildList(JSON.stringify([easBuild()]));
    assert.deepEqual(Object.keys(parsed).sort(), [
      "commit",
      "completedAt",
      "createdAt",
      "expirationDate",
      "id",
      "status",
      "version",
    ]);
    assert.equal(JSON.stringify(parsed).includes("signed-artifact"), false);
    assert.equal(JSON.stringify(parsed).includes("signed-logs"), false);
  });

  test("rejects malformed, oversized, or wrong-identity records", () => {
    assert.throws(() => parseEasBuildList("not json"));
    assert.throws(() => parseEasBuildList(JSON.stringify({})));
    assert.throws(() => parseEasBuildList(" ".repeat(256 * 1024 + 1)));
    for (const build of [
      easBuild({ profile: "production" }),
      easBuild({ channel: "development" }),
      easBuild({ distribution: "STORE" }),
      easBuild({ identifier: "dk.example.other" }),
      easBuild({ platform: "ANDROID" }),
      easBuild({ simulator: true }),
      easBuild({ id: "not-a-uuid" }),
    ]) {
      assert.throws(() => parseEasBuildList(JSON.stringify([build])));
    }
  });

  test("rejects non-canonical Expo pages before launching a browser", async () => {
    for (const url of [
      "https://example.test/builds/514db820-0eab-43cf-b8ed-65d23978bebd",
      "https://expo.dev/accounts/bare-traen/projects/bare-traen/builds/not-a-uuid",
      "https://expo.dev/accounts/bare-traen/projects/bare-traen/builds/514db820-0eab-43cf-b8ed-65d23978bebd?token=nope",
    ]) {
      await assert.rejects(() => openCanonicalBuildPage(url));
    }
  });
});

describe("IphonePreviewManager", () => {
  test("reuses a current finished build and opens only its canonical page", async () => {
    const environment = fakeEnvironment();
    const opened = [];
    const manager = createManager(environment, {
      opener: async (url) => opened.push(url),
    });

    await manager.initialize();
    assert.deepEqual(manager.getState(), {
      status: "ready",
      message: "En færdig iPhone-preview er klar til installation.",
      version: "1.2.0",
      checkedAt: NOW.toISOString(),
    });
    assert.equal(Object.hasOwn(manager.getState(), "buildId"), false);
    assert.equal(Object.hasOwn(manager.getState(), "url"), false);

    await manager.prepare();
    assert.deepEqual(opened, [
      `https://expo.dev/accounts/bare-traen/projects/bare-traen/builds/${BUILD_ID}`,
    ]);
    assert.equal(
      environment.calls.some(
        ({ file, args }) => file === "mise" && args.includes("build"),
      ),
      false,
    );
  });

  test("treats a build from another commit as current when mobile inputs match", async () => {
    const environment = fakeEnvironment({
      builds: [easBuild({ commit: PREVIOUS_HEAD })],
      inputsMatch: true,
    });
    const manager = createManager(environment);

    await manager.initialize();
    assert.equal(manager.getState().status, "ready");
    const diffCall = environment.calls.find(
      ({ file, args }) => file === "git" && args[0] === "diff",
    );
    assert.deepEqual(diffCall.args.slice(0, 6), [
      "diff",
      "--quiet",
      "--no-ext-diff",
      PREVIOUS_HEAD,
      HEAD,
      "--",
    ]);
    assert.deepEqual(diffCall.args.slice(6), MOBILE_BUILD_INPUT_PATHS);
  });

  test("starts exactly one fixed preview build when mobile inputs changed", async () => {
    const environment = fakeEnvironment({
      builds: [easBuild({ commit: PREVIOUS_HEAD })],
      inputsMatch: false,
    });
    const manager = createManager(environment);

    await manager.initialize();
    assert.equal(manager.getState().status, "needs-build");
    await Promise.all([manager.prepare(), manager.prepare()]);
    assert.equal(manager.getState().status, "queued");

    const buildCalls = environment.calls.filter(
      ({ file, args }) => file === "mise" && args.includes("build"),
    );
    assert.equal(buildCalls.length, 1);
    assert.deepEqual(buildCalls[0], {
      file: "mise",
      args: [...IPHONE_PREVIEW_TEST_CONSTANTS.startBuildArgs],
      options: {
        cwd: "/repo/apps/mobile",
        timeout: 120_000,
        maxBuffer: 256 * 1024,
      },
    });
    assert.equal(buildCalls[0].args.includes("--no-wait"), true);
    assert.equal(buildCalls[0].args.includes("--profile"), true);
    assert.equal(buildCalls[0].args.includes("preview"), true);
    assert.equal(buildCalls[0].options.shell, undefined);
  });

  test("tracks an existing matching build without creating a duplicate", async () => {
    const environment = fakeEnvironment({
      builds: [easBuild({ status: "IN_PROGRESS", completedAt: null })],
    });
    const manager = createManager(environment);

    await manager.initialize();
    assert.equal(manager.getState().status, "building");
    await manager.prepare();
    assert.equal(
      environment.calls.filter(
        ({ file, args }) => file === "mise" && args.includes("build"),
      ).length,
      0,
    );
  });

  test("blocks dirty mobile inputs before querying or starting EAS", async () => {
    const environment = fakeEnvironment({ dirty: true });
    const manager = createManager(environment);

    await manager.initialize();
    assert.equal(manager.getState().status, "error");
    assert.match(manager.getState().message, /Commit først/);
    await manager.prepare();
    assert.equal(
      environment.calls.some(({ file }) => file === "mise"),
      false,
    );
  });

  test("does not turn a failed submission into a phantom queued build", async () => {
    const environment = fakeEnvironment({ builds: [], startCode: 1 });
    const manager = createManager(environment);

    await manager.initialize();
    await manager.prepare();
    assert.equal(manager.getState().status, "error");
    assert.equal(JSON.stringify(manager.getState()).includes("stderr"), false);

    await manager.refresh({ force: true });
    assert.equal(manager.getState().status, "needs-build");
  });

  test("ignores an expired finished build", async () => {
    const environment = fakeEnvironment({
      builds: [easBuild({ expirationDate: "2026-08-21T19:00:00.000Z" })],
    });
    const manager = createManager(environment);

    await manager.initialize();
    assert.equal(manager.getState().status, "needs-build");
  });

  test("uses the pinned value-free list command", async () => {
    const environment = fakeEnvironment();
    const manager = createManager(environment);
    await manager.initialize();

    const listCall = environment.calls.find(
      ({ file, args }) => file === "mise" && args.includes("build:list"),
    );
    assert.equal(listCall.file, "mise");
    assert.deepEqual(listCall.args, [
      ...IPHONE_PREVIEW_TEST_CONSTANTS.listBuildArgs,
    ]);
    assert.deepEqual(listCall.options, {
      cwd: "/repo/apps/mobile",
      timeout: 45_000,
      maxBuffer: 256 * 1024,
    });
    assert.equal(listCall.options.shell, undefined);
  });
});
