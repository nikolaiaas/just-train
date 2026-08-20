import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ALLOWED_PORTS = new Set([11000, 11001]);
const MAX_ANCESTORS = 16;

function defaultRunFile(file, args) {
  return execFileAsync(file, args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024,
    timeout: 3_000,
    windowsHide: true,
  });
}

function isWithin(root, candidate) {
  if (typeof candidate !== "string" || candidate.length === 0) return false;
  const relative = path.relative(root, path.resolve(candidate));
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function normalizeCommand(command) {
  return String(command).trim().replace(/\s+/g, " ");
}

function matchesPnpmInvocation(command, argumentsText) {
  const escapedArguments = argumentsText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^(?:node )?(?:.+/)?pnpm(?:\\.cjs)? ${escapedArguments}$`,
  ).test(command);
}

function commandKind(record, serviceId, repositoryRoot) {
  const command = normalizeCommand(record.command);
  const cwd = path.resolve(record.cwd || "/__missing_cwd__");
  const rootCwd = cwd === repositoryRoot;
  const adminCwd = cwd === path.join(repositoryRoot, "apps", "admin");
  const mobileCwd = cwd === path.join(repositoryRoot, "apps", "mobile");

  if (rootCwd && matchesPnpmInvocation(command, "dev:web")) {
    return "shared-web";
  }

  if (serviceId === "admin") {
    if (
      rootCwd &&
      (matchesPnpmInvocation(command, "dev:admin") ||
        matchesPnpmInvocation(command, "--filter @bare-traen/admin dev"))
    ) {
      return "admin";
    }
    if (
      adminCwd &&
      /^node .+\/next(?:\/dist\/bin\/next)? dev --port 11000$/.test(command)
    ) {
      return "admin";
    }
    return null;
  }

  if (serviceId === "mobileWeb" || serviceId === "iphoneMetro") {
    if (
      rootCwd &&
      (matchesPnpmInvocation(command, "dev:mobile") ||
        matchesPnpmInvocation(command, "dev:iphone") ||
        matchesPnpmInvocation(command, "dev:iphone:tunnel") ||
        matchesPnpmInvocation(
          command,
          "--filter @bare-traen/mobile exec expo start --web --lan --port 11001",
        ))
    ) {
      return command.includes("--web") ? "mobile-web" : "iphone-metro";
    }
    if (
      mobileCwd &&
      /^node (?:\.\/|.+\/)node_modules\/\.bin\/\.\.\/expo\/bin\/cli start (?:--web --lan|--dev-client --(?:lan|tunnel)) --port 11001$/.test(
        command,
      )
    ) {
      return command.includes("--web") ? "mobile-web" : "iphone-metro";
    }
  }

  return null;
}

export function classifyProcessChain(chain, { repositoryRoot, serviceId }) {
  const normalizedRoot = path.resolve(repositoryRoot);
  let target = null;
  let sharedTarget = null;
  for (const record of chain) {
    if (!isWithin(normalizedRoot, record.cwd)) continue;
    const kind = commandKind(record, serviceId, normalizedRoot);
    if (!kind) continue;
    const candidate = {
      pid: record.pid,
      ppid: record.ppid,
      command: record.command,
      cwd: record.cwd,
      kind,
    };
    if (kind === "shared-web") {
      sharedTarget = candidate;
    } else {
      target = candidate;
    }
  }

  return target
    ? { verified: true, target, sharedTarget }
    : { verified: false, target: null, sharedTarget: null };
}

export function parseProcessRecord(psOutput, cwdOutput) {
  const match = String(psOutput).match(
    /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*$/s,
  );
  if (!match) return null;
  const cwdLine = String(cwdOutput)
    .split(/\r?\n/)
    .find((line) => line.startsWith("n"));
  if (!cwdLine || cwdLine.length < 2) return null;
  return {
    pid: Number(match[1]),
    ppid: Number(match[2]),
    pgid: Number(match[3]),
    command: match[4],
    cwd: cwdLine.slice(1),
  };
}

export class ProcessInspector {
  constructor({
    repositoryRoot,
    runFile = defaultRunFile,
    signalProcess = process.kill.bind(process),
    cacheMilliseconds = 500,
  }) {
    this.repositoryRoot = path.resolve(repositoryRoot);
    this.runFile = runFile;
    this.signalProcess = signalProcess;
    this.cacheMilliseconds = cacheMilliseconds;
    this.cache = new Map();
  }

  async inspectPort(port, serviceId, { fresh = false } = {}) {
    if (!ALLOWED_PORTS.has(port)) {
      throw new Error(
        "Process inspection is limited to Bare Træn frontend ports.",
      );
    }
    const cacheKey = String(port);
    const cached = this.cache.get(cacheKey);
    if (!fresh && cached && Date.now() - cached.at < this.cacheMilliseconds) {
      return cached.value;
    }

    const pending = this.#inspectPortUncached(port, serviceId);
    this.cache.set(cacheKey, { at: Date.now(), value: pending });
    return pending;
  }

  async terminateVerified(
    inspection,
    signal = "SIGTERM",
    { shared = false } = {},
  ) {
    if (inspection.ownership !== "verified-repository") return 0;
    const currentInspection = await this.inspectPort(
      inspection.port,
      inspection.serviceId,
      { fresh: true },
    );
    if (currentInspection.ownership !== "verified-repository") return 0;
    let signalled = 0;
    const requestedTargets =
      shared && inspection.sharedTargets.length > 0
        ? inspection.sharedTargets
        : inspection.targets;
    const currentTargets =
      shared && currentInspection.sharedTargets.length > 0
        ? currentInspection.sharedTargets
        : currentInspection.targets;
    for (const target of requestedTargets) {
      if (
        !currentTargets.some((candidate) =>
          this.#targetsMatch(candidate, target),
        )
      ) {
        continue;
      }
      const current = await this.#readProcess(target.pid);
      if (!current || !this.#sameTarget(current, target)) continue;
      try {
        this.signalProcess(target.pid, signal);
        signalled += 1;
      } catch (error) {
        if (error?.code !== "ESRCH") throw error;
      }
    }
    this.cache.clear();
    return signalled;
  }

  async #inspectPortUncached(port, serviceId) {
    const listenerPids = await this.#listenerPids(port);
    if (listenerPids.length === 0) {
      return {
        port,
        serviceId,
        listening: false,
        ownership: "none",
        stoppable: false,
        mode: null,
        targets: [],
        sharedTargets: [],
      };
    }

    const classifications = await Promise.all(
      listenerPids.map(async (pid) =>
        classifyProcessChain(await this.#readChain(pid), {
          repositoryRoot: this.repositoryRoot,
          serviceId,
        }),
      ),
    );
    if (classifications.some((classification) => !classification.verified)) {
      return {
        port,
        serviceId,
        listening: true,
        ownership: "unknown",
        stoppable: false,
        mode: null,
        targets: [],
        sharedTargets: [],
      };
    }

    const targets = [];
    const sharedTargets = [];
    const seen = new Set();
    const seenShared = new Set();
    for (const { target, sharedTarget } of classifications) {
      if (sharedTarget && !seenShared.has(sharedTarget.pid)) {
        seenShared.add(sharedTarget.pid);
        sharedTargets.push(sharedTarget);
      }
      if (seen.has(target.pid)) continue;
      seen.add(target.pid);
      targets.push(target);
    }
    const modes = new Set(
      targets.map((target) =>
        target.kind === "shared-web" ? "mobile-web" : target.kind,
      ),
    );
    if (modes.size !== 1) {
      return {
        port,
        serviceId,
        listening: true,
        ownership: "unknown",
        stoppable: false,
        mode: null,
        targets: [],
        sharedTargets: [],
      };
    }
    return {
      port,
      serviceId,
      listening: true,
      ownership: "verified-repository",
      stoppable: true,
      mode: port === 11000 ? "admin" : [...modes][0],
      targets,
      sharedTargets,
    };
  }

  async #listenerPids(port) {
    try {
      const result = await this.runFile("lsof", [
        "-nP",
        "-t",
        `-iTCP:${port}`,
        "-sTCP:LISTEN",
      ]);
      return [
        ...new Set(
          String(result.stdout)
            .split(/\s+/)
            .filter((value) => /^\d+$/.test(value))
            .map(Number)
            .filter((pid) => Number.isSafeInteger(pid) && pid > 1),
        ),
      ];
    } catch {
      return [];
    }
  }

  async #readChain(listenerPid) {
    const chain = [];
    const seen = new Set();
    let pid = listenerPid;
    while (pid > 1 && chain.length < MAX_ANCESTORS && !seen.has(pid)) {
      seen.add(pid);
      const record = await this.#readProcess(pid);
      if (!record) break;
      chain.push(record);
      pid = record.ppid;
    }
    return chain;
  }

  async #readProcess(pid) {
    if (!Number.isSafeInteger(pid) || pid <= 1) return null;
    try {
      const [psResult, cwdResult] = await Promise.all([
        this.runFile("ps", [
          "-ww",
          "-p",
          String(pid),
          "-o",
          "pid=,ppid=,pgid=,command=",
        ]),
        this.runFile("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]),
      ]);
      return parseProcessRecord(psResult.stdout, cwdResult.stdout);
    } catch {
      return null;
    }
  }

  #sameTarget(current, target) {
    return (
      current.pid === target.pid &&
      current.ppid === target.ppid &&
      current.command === target.command &&
      current.cwd === target.cwd &&
      commandKind(
        current,
        target.kind === "admin" ? "admin" : "mobileWeb",
        this.repositoryRoot,
      ) === target.kind
    );
  }

  #targetsMatch(first, second) {
    return (
      first.pid === second.pid &&
      first.ppid === second.ppid &&
      first.command === second.command &&
      first.cwd === second.cwd &&
      first.kind === second.kind
    );
  }
}
