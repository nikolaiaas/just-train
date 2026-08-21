import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const EAS_CLI_PACKAGE = "eas-cli@22.2.0";
const EXPO_OWNER = "bare-traen";
const EXPO_PROJECT_ID = "50f7b492-8b24-4bae-9dda-ecfc7dcebbff";
const EXPO_PROJECT_SLUG = "bare-traen";
const IOS_APP_IDENTIFIER = "dk.baretraen.app.preview";
const PREVIEW_BUILD_PROFILE = "preview";
const PREVIEW_CHANNEL = "preview";
const MAX_EAS_BUILDS = 10;
const MAX_COMMAND_OUTPUT_BYTES = 256 * 1024;
const DEFAULT_CACHE_MILLISECONDS = 5 * 60_000;
const DEFAULT_POLL_MILLISECONDS = 15_000;
const DEFAULT_SUBMISSION_GRACE_MILLISECONDS = 90_000;

const ACTIVE_BUILD_STATUSES = new Set(["NEW", "IN_QUEUE", "IN_PROGRESS"]);
const KNOWN_BUILD_STATUSES = new Set([
  ...ACTIVE_BUILD_STATUSES,
  "PENDING_CANCEL",
  "ERRORED",
  "FINISHED",
  "CANCELED",
]);
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const UUID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

// These paths determine the installed binary and embedded JavaScript. Changes
// elsewhere in the repository must not force a new phone build.
export const MOBILE_BUILD_INPUT_PATHS = Object.freeze([
  ".gitignore",
  ".mise.toml",
  ".npmrc",
  ".nvmrc",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "apps/mobile",
  "packages/api-client",
  "packages/design",
  "packages/domain",
  "patches",
]);

const LIST_BUILD_ARGS = Object.freeze([
  "exec",
  "--",
  "pnpm",
  "dlx",
  EAS_CLI_PACKAGE,
  "build:list",
  "--platform",
  "ios",
  "--distribution",
  "internal",
  "--build-profile",
  PREVIEW_BUILD_PROFILE,
  "--app-identifier",
  IOS_APP_IDENTIFIER,
  "--channel",
  PREVIEW_CHANNEL,
  "--limit",
  String(MAX_EAS_BUILDS),
  "--json",
  "--non-interactive",
]);

const START_BUILD_ARGS = Object.freeze([
  "exec",
  "--",
  "pnpm",
  "dlx",
  EAS_CLI_PACKAGE,
  "build",
  "--platform",
  "ios",
  "--profile",
  PREVIEW_BUILD_PROFILE,
  "--non-interactive",
  "--no-wait",
  "--freeze-credentials",
  "--json",
]);

const INITIAL_STATE = Object.freeze({
  status: "checking",
  message: "Finder den seneste iPhone-preview…",
  version: null,
  checkedAt: null,
});

const MESSAGES = Object.freeze({
  checking: "Finder den seneste iPhone-preview…",
  ready: "En færdig iPhone-preview er klar til installation.",
  needsBuild:
    "Der skal bygges en ny iPhone-preview til de aktuelle mobilfiler.",
  queued: "iPhone-previewet venter på at blive bygget hos Expo.",
  building: "iPhone-previewet bygges hos Expo.",
  dirty:
    "Commit først ændringer i mobilens buildfiler, før en iPhone-preview kan genbruges eller bygges.",
  localCheckFailed: "Mobilens buildgrundlag kunne ikke kontrolleres sikkert.",
  easCheckFailed:
    "Expo-builds kunne ikke kontrolleres. Kontrollér EAS-login og netværk.",
  buildFailed:
    "iPhone-previewet kunne ikke startes. Kontrollér EAS-login og buildopsætning.",
  openFailed: "Installationssiden kunne ikke åbnes på denne Mac.",
});

class PreviewDataError extends Error {}

function safeNow(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new PreviewDataError();
  return date;
}

function parseIsoTimestamp(value) {
  if (typeof value !== "string" || value.length > 40) {
    throw new PreviewDataError();
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new PreviewDataError();
  return milliseconds;
}

function parseVersion(value) {
  if (
    typeof value !== "string" ||
    value.length > 40 ||
    !VERSION_PATTERN.test(value)
  ) {
    throw new PreviewDataError();
  }
  return value;
}

function parseCurrentVersion(stdout) {
  if (
    typeof stdout !== "string" ||
    Buffer.byteLength(stdout) > MAX_COMMAND_OUTPUT_BYTES
  ) {
    throw new PreviewDataError();
  }
  let appConfig;
  try {
    appConfig = JSON.parse(stdout);
  } catch {
    throw new PreviewDataError();
  }
  return parseVersion(appConfig?.expo?.version);
}

function validateBuild(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PreviewDataError();
  }
  if (
    typeof value.id !== "string" ||
    !UUID_PATTERN.test(value.id) ||
    value.platform !== "IOS" ||
    value.distribution !== "INTERNAL" ||
    value.buildProfile !== PREVIEW_BUILD_PROFILE ||
    value.appIdentifier !== IOS_APP_IDENTIFIER ||
    value.isForIosSimulator !== false ||
    !KNOWN_BUILD_STATUSES.has(value.status) ||
    value.updateChannel?.name !== PREVIEW_CHANNEL ||
    value.app?.id !== EXPO_PROJECT_ID ||
    value.app?.slug !== EXPO_PROJECT_SLUG ||
    value.app?.ownerAccount?.name !== EXPO_OWNER ||
    typeof value.gitCommitHash !== "string" ||
    !COMMIT_PATTERN.test(value.gitCommitHash)
  ) {
    throw new PreviewDataError();
  }

  const createdAt = parseIsoTimestamp(value.createdAt);
  const completedAt =
    value.completedAt === null || value.completedAt === undefined
      ? null
      : parseIsoTimestamp(value.completedAt);
  const expirationDate =
    value.expirationDate === null || value.expirationDate === undefined
      ? null
      : parseIsoTimestamp(value.expirationDate);

  if (value.status === "FINISHED" && completedAt === null) {
    throw new PreviewDataError();
  }

  return Object.freeze({
    id: value.id,
    status: value.status,
    version: parseVersion(value.appVersion),
    commit: value.gitCommitHash,
    createdAt,
    completedAt,
    expirationDate,
  });
}

export function parseEasBuildList(stdout) {
  if (
    typeof stdout !== "string" ||
    Buffer.byteLength(stdout) > MAX_COMMAND_OUTPUT_BYTES
  ) {
    throw new PreviewDataError();
  }
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new PreviewDataError();
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_EAS_BUILDS) {
    throw new PreviewDataError();
  }
  return parsed
    .map(validateBuild)
    .sort((first, second) => second.createdAt - first.createdAt);
}

function parseStartedBuild(stdout) {
  const builds = parseEasBuildList(stdout);
  if (builds.length !== 1 || !ACTIVE_BUILD_STATUSES.has(builds[0].status)) {
    throw new PreviewDataError();
  }
  return builds[0];
}

function canonicalBuildPage(buildId) {
  if (!UUID_PATTERN.test(buildId)) throw new PreviewDataError();
  return `https://expo.dev/accounts/${EXPO_OWNER}/projects/${EXPO_PROJECT_SLUG}/builds/${buildId}`;
}

export async function execFileRunner(file, args, options) {
  try {
    const result = await execFileAsync(file, args, {
      ...options,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
      windowsHide: true,
    });
    return { code: 0, stdout: result.stdout };
  } catch (error) {
    return {
      code: Number.isInteger(error?.code) ? error.code : null,
      stdout: typeof error?.stdout === "string" ? error.stdout : "",
    };
  }
}

export async function openCanonicalBuildPage(url) {
  if (typeof url !== "string") {
    throw new PreviewDataError();
  }
  const prefix = `https://expo.dev/accounts/${EXPO_OWNER}/projects/${EXPO_PROJECT_SLUG}/builds/`;
  if (!url.startsWith(prefix) || !UUID_PATTERN.test(url.slice(prefix.length))) {
    throw new PreviewDataError();
  }
  const result = await execFileRunner("open", [url], {
    timeout: 5_000,
    maxBuffer: 16 * 1024,
  });
  if (result.code !== 0) throw new PreviewDataError();
}

function activeStatus(status) {
  return status === "IN_PROGRESS" ? "building" : "queued";
}

function buildMessage(status) {
  return status === "building" ? MESSAGES.building : MESSAGES.queued;
}

export class IphonePreviewManager {
  constructor({
    repositoryRoot,
    runner = execFileRunner,
    opener = openCanonicalBuildPage,
    clock = () => new Date(),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    cacheMilliseconds = DEFAULT_CACHE_MILLISECONDS,
    pollMilliseconds = DEFAULT_POLL_MILLISECONDS,
    submissionGraceMilliseconds = DEFAULT_SUBMISSION_GRACE_MILLISECONDS,
  } = {}) {
    this.repositoryRoot = repositoryRoot;
    this.mobileDirectory = path.join(repositoryRoot, "apps/mobile");
    this.runner = runner;
    this.opener = opener;
    this.clock = clock;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.cacheMilliseconds = cacheMilliseconds;
    this.pollMilliseconds = pollMilliseconds;
    this.submissionGraceMilliseconds = submissionGraceMilliseconds;
    this.state = { ...INITIAL_STATE };
    this.selectedBuild = null;
    this.currentHead = null;
    this.lastCheckedMilliseconds = null;
    this.refreshPromise = null;
    this.preparePromise = null;
    this.pollTimer = null;
    this.submissionAttempt = null;
    this.closed = false;
  }

  getState() {
    return { ...this.state };
  }

  async initialize() {
    return this.refresh({ force: true });
  }

  async shutdown() {
    this.closed = true;
    if (this.pollTimer !== null) {
      this.clearTimer(this.pollTimer);
      this.pollTimer = null;
    }
    await Promise.allSettled(
      [this.refreshPromise, this.preparePromise].filter(Boolean),
    );
  }

  refresh({ force = false } = {}) {
    if (this.closed) return Promise.resolve(this.getState());
    if (this.refreshPromise) return this.refreshPromise;

    let now;
    try {
      now = safeNow(this.clock);
    } catch {
      this.#setError(MESSAGES.localCheckFailed, null);
      return Promise.resolve(this.getState());
    }
    if (
      !force &&
      this.lastCheckedMilliseconds !== null &&
      now.getTime() - this.lastCheckedMilliseconds < this.cacheMilliseconds
    ) {
      return Promise.resolve(this.getState());
    }

    this.state = {
      status: "checking",
      message: MESSAGES.checking,
      version: this.state.version,
      checkedAt: this.state.checkedAt,
    };
    const operation = this.#refresh(now)
      .catch(() => {
        this.#setError(MESSAGES.easCheckFailed, this.state.version);
      })
      .finally(() => {
        if (this.refreshPromise === operation) this.refreshPromise = null;
      });
    this.refreshPromise = operation;
    return operation.then(() => this.getState());
  }

  prepare() {
    if (this.closed) return Promise.resolve(this.getState());
    if (this.preparePromise) return this.preparePromise;
    const operation = this.#prepare()
      .catch(() => {
        this.submissionAttempt = null;
        this.#setError(MESSAGES.buildFailed, this.state.version);
      })
      .finally(() => {
        if (this.preparePromise === operation) this.preparePromise = null;
      });
    this.preparePromise = operation;
    return operation.then(() => this.getState());
  }

  async #refresh(now) {
    const local = await this.#inspectLocalInputs();
    this.currentHead = local.head;

    if (!local.clean) {
      this.selectedBuild = null;
      this.#setState("error", MESSAGES.dirty, local.version, now);
      return;
    }

    const listed = await this.#runEasList();
    const matching = [];
    const equivalence = new Map();
    for (const build of listed) {
      if (build.version !== local.version) continue;
      let equivalent = equivalence.get(build.commit);
      if (equivalent === undefined) {
        equivalent = await this.#inputsMatch(build.commit, local.head);
        equivalence.set(build.commit, equivalent);
      }
      if (equivalent) matching.push(build);
    }

    const usable = matching.find(
      (build) =>
        ACTIVE_BUILD_STATUSES.has(build.status) ||
        (build.status === "FINISHED" &&
          build.expirationDate !== null &&
          build.expirationDate > now.getTime()),
    );

    this.lastCheckedMilliseconds = now.getTime();
    if (usable) {
      this.selectedBuild = usable;
      this.submissionAttempt = null;
      if (ACTIVE_BUILD_STATUSES.has(usable.status)) {
        const status = activeStatus(usable.status);
        this.#setState(status, buildMessage(status), usable.version, now);
        this.#schedulePoll();
      } else {
        this.#setState("ready", MESSAGES.ready, usable.version, now);
      }
      return;
    }

    this.selectedBuild = null;
    if (
      this.submissionAttempt?.head === local.head &&
      now.getTime() - this.submissionAttempt.at <
        this.submissionGraceMilliseconds
    ) {
      this.#setState("queued", MESSAGES.queued, local.version, now);
      this.#schedulePoll();
      return;
    }
    this.submissionAttempt = null;
    this.#setState("needs-build", MESSAGES.needsBuild, local.version, now);
  }

  async #prepare() {
    await this.refresh({ force: true });
    if (this.state.status === "error") return;

    if (this.state.status === "ready" && this.selectedBuild) {
      try {
        await this.opener(canonicalBuildPage(this.selectedBuild.id));
      } catch {
        this.#setError(MESSAGES.openFailed, this.state.version);
        return;
      }
      this.#setState(
        "ready",
        MESSAGES.ready,
        this.selectedBuild.version,
        safeNow(this.clock),
      );
      return;
    }

    if (this.state.status === "queued" || this.state.status === "building") {
      return;
    }

    if (this.state.status !== "needs-build") return;

    // Close the status/build race as tightly as practical by rechecking the
    // current commit and all mobile build inputs immediately before EAS upload.
    const local = await this.#inspectLocalInputs();
    if (!local.clean || local.head !== this.currentHead) {
      this.selectedBuild = null;
      this.#setState(
        "error",
        MESSAGES.dirty,
        local.version,
        safeNow(this.clock),
      );
      return;
    }

    const now = safeNow(this.clock);
    if (
      this.submissionAttempt?.head === local.head &&
      now.getTime() - this.submissionAttempt.at <
        this.submissionGraceMilliseconds
    ) {
      this.#setState("queued", MESSAGES.queued, local.version, now);
      this.#schedulePoll();
      return;
    }

    this.submissionAttempt = { head: local.head, at: now.getTime() };
    const result = await this.runner("mise", [...START_BUILD_ARGS], {
      cwd: this.mobileDirectory,
      timeout: 120_000,
      maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
    });
    if (result?.code !== 0) {
      this.submissionAttempt = null;
      this.#setState("error", MESSAGES.buildFailed, local.version, now);
      return;
    }

    let started;
    try {
      started = parseStartedBuild(result.stdout);
    } catch {
      this.submissionAttempt = null;
      this.#setState("error", MESSAGES.buildFailed, local.version, now);
      return;
    }
    if (
      started.version !== local.version ||
      !(await this.#inputsMatch(started.commit, local.head))
    ) {
      this.submissionAttempt = null;
      this.#setState("error", MESSAGES.buildFailed, local.version, now);
      return;
    }

    this.selectedBuild = started;
    const status = activeStatus(started.status);
    this.#setState(status, buildMessage(status), started.version, now);
    this.#schedulePoll();
  }

  async #inspectLocalInputs() {
    const headResult = await this.runner(
      "git",
      ["rev-parse", "--verify", "HEAD^{commit}"],
      {
        cwd: this.repositoryRoot,
        timeout: 5_000,
        maxBuffer: 4 * 1024,
      },
    );
    const head = headResult?.stdout?.trim();
    if (headResult?.code !== 0 || !COMMIT_PATTERN.test(head ?? "")) {
      throw new PreviewDataError();
    }

    const versionResult = await this.runner(
      "git",
      ["show", "HEAD:apps/mobile/app.json"],
      {
        cwd: this.repositoryRoot,
        timeout: 5_000,
        maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
      },
    );
    if (versionResult?.code !== 0) throw new PreviewDataError();
    const version = parseCurrentVersion(versionResult.stdout);

    const statusResult = await this.runner(
      "git",
      [
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
        "--",
        ...MOBILE_BUILD_INPUT_PATHS,
      ],
      {
        cwd: this.repositoryRoot,
        timeout: 5_000,
        maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
      },
    );
    if (statusResult?.code !== 0) throw new PreviewDataError();
    return { head, version, clean: statusResult.stdout.length === 0 };
  }

  async #runEasList() {
    const result = await this.runner("mise", [...LIST_BUILD_ARGS], {
      cwd: this.mobileDirectory,
      timeout: 45_000,
      maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
    });
    if (result?.code !== 0) throw new PreviewDataError();
    return parseEasBuildList(result.stdout);
  }

  async #inputsMatch(commit, head) {
    if (commit === head) return true;
    const result = await this.runner(
      "git",
      [
        "diff",
        "--quiet",
        "--no-ext-diff",
        commit,
        head,
        "--",
        ...MOBILE_BUILD_INPUT_PATHS,
      ],
      {
        cwd: this.repositoryRoot,
        timeout: 10_000,
        maxBuffer: 4 * 1024,
      },
    );
    return result?.code === 0;
  }

  #setState(status, message, version, checkedAt) {
    const date = checkedAt instanceof Date ? checkedAt : safeNow(this.clock);
    this.state = {
      status,
      message,
      version,
      checkedAt: date.toISOString(),
    };
    this.lastCheckedMilliseconds = date.getTime();
    if (status !== "queued" && status !== "building" && this.pollTimer) {
      this.clearTimer(this.pollTimer);
      this.pollTimer = null;
    }
  }

  #setError(message, version) {
    let now;
    try {
      now = safeNow(this.clock);
    } catch {
      now = new Date(0);
    }
    this.#setState("error", message, version, now);
  }

  #schedulePoll() {
    if (this.closed || this.pollTimer !== null) return;
    this.pollTimer = this.setTimer(() => {
      this.pollTimer = null;
      if (this.closed) return;
      void this.refresh({ force: true }).catch(() => undefined);
    }, this.pollMilliseconds);
    this.pollTimer?.unref?.();
  }
}

export const IPHONE_PREVIEW_TEST_CONSTANTS = Object.freeze({
  easCliPackage: EAS_CLI_PACKAGE,
  listBuildArgs: LIST_BUILD_ARGS,
  startBuildArgs: START_BUILD_ARGS,
  expoProjectId: EXPO_PROJECT_ID,
  iosAppIdentifier: IOS_APP_IDENTIFIER,
});
