import { spawn } from "node:child_process";
import net from "node:net";
import { StringDecoder } from "node:string_decoder";

import { BoundedLog, InputError, SERVICE_IDS } from "./core.mjs";
import { ProcessInspector } from "./process-inspector.mjs";

const FRONTEND_DEFINITIONS = Object.freeze({
  admin: {
    id: "admin",
    label: "Administration",
    port: 11000,
    url: "http://localhost:11000",
    command: ["mise", "exec", "--", "pnpm", "dev:admin"],
  },
  mobileWeb: {
    id: "mobileWeb",
    label: "Mobile web",
    port: 11001,
    url: "http://localhost:11001",
    command: [
      "mise",
      "exec",
      "--",
      "pnpm",
      "--filter",
      "@bare-traen/mobile",
      "exec",
      "expo",
      "start",
      "--web",
      "--lan",
      "--port",
      "11001",
    ],
  },
  iphoneMetro: {
    id: "iphoneMetro",
    label: "iPhone Metro",
    port: 11001,
    url: "http://localhost:11001",
    command: ["mise", "exec", "--", "pnpm", "dev:iphone"],
  },
});

const SUPABASE_COMMANDS = Object.freeze({
  start: ["mise", "exec", "--", "pnpm", "supabase:start"],
  stop: ["mise", "exec", "--", "pnpm", "supabase:stop"],
  status: ["mise", "exec", "--", "pnpm", "supabase:status"],
});

class ServiceConflictError extends InputError {
  constructor(message) {
    super(message, { code: "service_conflict", statusCode: 409 });
  }
}

class LineCapture {
  constructor(onLine) {
    this.decoder = new StringDecoder("utf8");
    this.buffer = "";
    this.onLine = onLine;
  }

  write(chunk) {
    this.buffer += this.decoder.write(chunk);
    this.#drainLines();
    if (this.buffer.length > 64_000) {
      this.onLine("[long command output hidden]");
      this.buffer = "";
    }
  }

  end() {
    this.buffer += this.decoder.end();
    this.#drainLines();
    if (this.buffer) this.onLine(this.buffer);
    this.buffer = "";
  }

  #drainLines() {
    const lines = this.buffer.split(/\r?\n|\r/);
    this.buffer = lines.pop() ?? "";
    for (const line of lines) this.onLine(line);
  }
}

export function isPortListening(port, host = "127.0.0.1", timeoutMs = 350) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function processExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => child.once("exit", resolve));
}

function timeout(milliseconds) {
  return new Promise((resolve) =>
    setTimeout(() => resolve("timeout"), milliseconds),
  );
}

export class ServiceManager {
  constructor({
    repositoryRoot,
    spawnProcess = spawn,
    portProbe = isPortListening,
    processInspector = new ProcessInspector({ repositoryRoot }),
    gracefulStopMilliseconds = 7_000,
    forceStopMilliseconds = 1_500,
    sharedSiblingSettleMilliseconds = 2_000,
  } = {}) {
    this.repositoryRoot = repositoryRoot;
    this.spawnProcess = spawnProcess;
    this.portProbe = portProbe;
    this.processInspector = processInspector;
    this.gracefulStopMilliseconds = gracefulStopMilliseconds;
    this.forceStopMilliseconds = forceStopMilliseconds;
    this.sharedSiblingSettleMilliseconds = sharedSiblingSettleMilliseconds;
    this.frontends = Object.fromEntries(
      Object.keys(FRONTEND_DEFINITIONS).map((id) => [
        id,
        {
          child: null,
          lifecycle: "stopped",
          lastError: null,
          stopRequested: false,
        },
      ]),
    );
    this.logs = Object.fromEntries(
      SERVICE_IDS.map((id) => [id, new BoundedLog()]),
    );
    this.supabase = {
      lifecycle: "stopped",
      lastError: null,
      checkedAt: null,
      operation: null,
    };
    this.supabaseQueue = Promise.resolve();
    this.oneShotChildren = new Set();
    this.shuttingDown = false;
  }

  async initialize() {
    await this.refreshSupabaseStatus();
  }

  async getServiceStates() {
    const entries = await Promise.all(
      Object.entries(FRONTEND_DEFINITIONS).map(async ([id, definition]) => {
        const runtime = this.frontends[id];
        const listening = await this.portProbe(definition.port);
        let status;
        let detail = null;
        let managed = false;
        let stoppable = false;
        let ownership = "none";
        let portConflict = false;

        if (runtime.child) {
          managed = true;
          stoppable = true;
          ownership = "console";
          status = listening ? "running" : runtime.lifecycle;
          if (status === "running") runtime.lifecycle = "running";
        } else if (listening) {
          const inspection = await this.processInspector.inspectPort(
            definition.port,
            id,
          );
          const expectedMode = this.#expectedMode(id);
          if (
            inspection.ownership === "verified-repository" &&
            inspection.mode !== expectedMode
          ) {
            status = "stopped";
            portConflict = true;
            detail =
              inspection.mode === "mobile-web"
                ? "Mobile web is using shared port 11001."
                : "iPhone Metro is using shared port 11001.";
          } else {
            status = "external";
            ownership =
              inspection.ownership === "verified-repository"
                ? "verified-repository"
                : "unknown";
            stoppable = inspection.stoppable;
            portConflict = true;
            detail = inspection.stoppable
              ? "This Bare Træn service was started outside the console and can be stopped safely."
              : `Port ${definition.port} is used by an unverified process. The console will not stop it.`;
          }
        } else if (runtime.lifecycle === "error") {
          status = "error";
        } else {
          status = "stopped";
        }

        return [
          id,
          {
            id,
            label: definition.label,
            status,
            managed,
            stoppable,
            ownership,
            portConflict,
            port: definition.port,
            url: definition.url,
            detail,
            lastError: runtime.lastError,
          },
        ];
      }),
    );

    entries.push([
      "supabase",
      {
        id: "supabase",
        label: "Local Supabase",
        status: this.supabase.lifecycle,
        managed: this.supabase.lifecycle !== "error",
        stoppable: this.supabase.lifecycle !== "stopped",
        ownership:
          this.supabase.lifecycle === "stopped" ? "none" : "repository",
        portConflict: false,
        port: 54321,
        url: "http://localhost:54321",
        studioUrl: "http://localhost:54323",
        detail:
          this.supabase.lifecycle === "stopped"
            ? "Open Docker Desktop before starting the local backend."
            : null,
        lastError: this.supabase.lastError,
      },
    ]);

    return Object.fromEntries(entries);
  }

  getLogs() {
    return Object.fromEntries(
      Object.entries(this.logs).map(([id, log]) => [id, log.snapshot()]),
    );
  }

  async perform({ action, service }) {
    if (action === "start") return this.start(service);
    if (action === "stop") return this.stop(service);
    if (action === "start-local-web") return this.startLocalWeb();
    if (action === "stop-my-apps") return this.stopMyApps();
    if (action === "refresh") return this.refreshSupabaseStatus();
    throw new InputError("Unknown development action.");
  }

  async start(serviceId) {
    if (serviceId === "supabase") return this.startSupabase();
    const definition = FRONTEND_DEFINITIONS[serviceId];
    if (!definition) throw new InputError("Unknown service.");

    const runtime = this.frontends[serviceId];
    if (runtime.child) return;

    const mutuallyExclusiveId =
      serviceId === "mobileWeb"
        ? "iphoneMetro"
        : serviceId === "iphoneMetro"
          ? "mobileWeb"
          : null;
    if (mutuallyExclusiveId) {
      if (this.frontends[mutuallyExclusiveId].child) {
        await this.stop(mutuallyExclusiveId);
      }
    }

    if (await this.portProbe(definition.port)) {
      const inspection = await this.processInspector.inspectPort(
        definition.port,
        serviceId,
        { fresh: true },
      );
      if (inspection.ownership !== "verified-repository") {
        throw new ServiceConflictError(
          `Port ${definition.port} is already in use by an unverified process. Stop it yourself before starting ${definition.label}.`,
        );
      }
      if (inspection.mode === this.#expectedMode(serviceId)) return;
      await this.#stopVerifiedExternal(serviceId, definition, inspection, {
        preserveSharedSibling: false,
      });
    }

    runtime.lifecycle = "starting";
    runtime.lastError = null;
    runtime.stopRequested = false;
    this.logs[serviceId].add("system", `Starting ${definition.label}…`);

    const [file, ...args] = definition.command;
    const child = this.spawnProcess(file, args, {
      cwd: this.repositoryRoot,
      detached: process.platform !== "win32",
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    runtime.child = child;
    this.#captureChildOutput(serviceId, child);

    child.once("error", (error) => {
      if (runtime.child !== child) return;
      runtime.child = null;
      runtime.lifecycle = "error";
      runtime.lastError = `Could not start ${definition.label}.`;
      this.logs[serviceId].add("system", runtime.lastError);
      void error;
    });
    child.once("exit", (code, signal) => {
      if (runtime.child !== child) return;
      runtime.child = null;
      if (runtime.stopRequested || this.shuttingDown) {
        runtime.lifecycle = "stopped";
        runtime.lastError = null;
        this.logs[serviceId].add("system", `${definition.label} stopped.`);
      } else if (code === 0) {
        runtime.lifecycle = "stopped";
        this.logs[serviceId].add("system", `${definition.label} exited.`);
      } else {
        runtime.lifecycle = "error";
        runtime.lastError = `${definition.label} exited unexpectedly${
          signal ? ` (${signal})` : code === null ? "" : ` (code ${code})`
        }.`;
        this.logs[serviceId].add("system", runtime.lastError);
      }
    });
  }

  async stop(serviceId) {
    if (serviceId === "supabase") return this.stopSupabase();
    const definition = FRONTEND_DEFINITIONS[serviceId];
    if (!definition) throw new InputError("Unknown service.");

    const runtime = this.frontends[serviceId];
    if (!runtime.child) {
      if (!(await this.portProbe(definition.port))) {
        runtime.lifecycle = "stopped";
        runtime.lastError = null;
        return;
      }
      const inspection = await this.processInspector.inspectPort(
        definition.port,
        serviceId,
        { fresh: true },
      );
      if (
        inspection.ownership === "verified-repository" &&
        inspection.mode !== this.#expectedMode(serviceId)
      ) {
        return;
      }
      if (inspection.ownership !== "verified-repository") {
        throw new ServiceConflictError(
          `${definition.label} is owned by an unverified process. This console will not stop it.`,
        );
      }
      await this.#stopVerifiedExternal(serviceId, definition, inspection);
      runtime.lifecycle = "stopped";
      runtime.lastError = null;
      return;
    }

    const child = runtime.child;
    runtime.lifecycle = "stopping";
    runtime.stopRequested = true;
    this.logs[serviceId].add("system", `Stopping ${definition.label}…`);
    this.#signalChild(child, "SIGTERM");
    const result = await Promise.race([
      processExit(child),
      timeout(this.gracefulStopMilliseconds),
    ]);
    if (result === "timeout" && runtime.child === child) {
      this.logs[serviceId].add(
        "system",
        `${definition.label} did not stop gracefully; ending its managed process.`,
      );
      this.#signalChild(child, "SIGKILL");
      await Promise.race([
        processExit(child),
        timeout(this.forceStopMilliseconds),
      ]);
    }
    if (runtime.child === child) {
      runtime.child = null;
      runtime.lifecycle = "stopped";
      runtime.lastError = null;
    }
  }

  async startLocalWeb() {
    const adminRuntime = this.frontends.admin;
    if (!adminRuntime.child && (await this.portProbe(11000))) {
      const inspection = await this.processInspector.inspectPort(
        11000,
        "admin",
        {
          fresh: true,
        },
      );
      if (inspection.ownership !== "verified-repository") {
        throw new ServiceConflictError(
          "Port 11000 is already in use by an unverified process. This console will not replace it.",
        );
      }
    }
    const mobileRuntime = this.frontends.mobileWeb;
    const iphoneRuntime = this.frontends.iphoneMetro;
    if (
      !mobileRuntime.child &&
      !iphoneRuntime.child &&
      (await this.portProbe(11001))
    ) {
      const inspection = await this.processInspector.inspectPort(
        11001,
        "mobileWeb",
        { fresh: true },
      );
      if (inspection.ownership !== "verified-repository") {
        throw new ServiceConflictError(
          "Port 11001 is already in use by an unverified process. This console will not replace it.",
        );
      }
    }

    await Promise.all([
      this.startSupabase(),
      this.start("admin"),
      this.start("mobileWeb"),
    ]);
  }

  async stopMyApps() {
    await Promise.all([this.#stopAllFrontends(), this.stopSupabase()]);
  }

  async #stopAllFrontends() {
    await this.#stopManagedFrontends();
    for (const inspectionServiceId of ["admin", "mobileWeb"]) {
      const inspectionDefinition = FRONTEND_DEFINITIONS[inspectionServiceId];
      if (!(await this.portProbe(inspectionDefinition.port))) continue;
      const inspection = await this.processInspector.inspectPort(
        inspectionDefinition.port,
        inspectionServiceId,
        { fresh: true },
      );
      if (inspection.ownership !== "verified-repository") {
        this.logs[inspectionServiceId].add(
          "system",
          `Protected an unverified process on port ${inspectionDefinition.port}; it was left running.`,
        );
        continue;
      }
      const serviceId =
        inspection.mode === "iphone-metro"
          ? "iphoneMetro"
          : inspectionServiceId;
      const definition = FRONTEND_DEFINITIONS[serviceId];
      await this.#stopVerifiedExternal(serviceId, definition, inspection, {
        preserveSharedSibling: false,
      });
    }
  }

  async #stopManagedFrontends() {
    const managed = Object.keys(FRONTEND_DEFINITIONS).filter(
      (id) => this.frontends[id].child,
    );
    await Promise.all(managed.map((id) => this.stop(id)));
  }

  #expectedMode(serviceId) {
    if (serviceId === "admin") return "admin";
    if (serviceId === "mobileWeb") return "mobile-web";
    if (serviceId === "iphoneMetro") return "iphone-metro";
    return null;
  }

  async #stopVerifiedExternal(
    serviceId,
    definition,
    inspection,
    { preserveSharedSibling = true } = {},
  ) {
    const sibling = preserveSharedSibling
      ? await this.#sharedSiblingSnapshot(serviceId, inspection)
      : null;
    this.logs[serviceId].add(
      "system",
      `Stopping verified ${definition.label} from this Bare Træn checkout…`,
    );
    const signalled = await this.processInspector.terminateVerified(
      inspection,
      "SIGTERM",
    );
    if (signalled === 0) {
      throw new ServiceConflictError(
        `${definition.label} changed ownership before it could be stopped. Nothing was terminated.`,
      );
    }

    let closed = await this.#waitForPortToClose(
      definition.port,
      this.gracefulStopMilliseconds,
    );
    for (let attempt = 0; !closed && attempt < 2; attempt += 1) {
      const current = await this.processInspector.inspectPort(
        definition.port,
        serviceId,
        { fresh: true },
      );
      if (
        current.ownership !== "verified-repository" ||
        current.mode !== this.#expectedMode(serviceId)
      ) {
        break;
      }
      await this.processInspector.terminateVerified(current, "SIGKILL");
      closed = await this.#waitForPortToClose(
        definition.port,
        this.forceStopMilliseconds,
      );
    }
    if (!closed) {
      throw new ServiceConflictError(
        `${definition.label} is still using port ${definition.port}. The console stopped because it could no longer verify a safe target.`,
      );
    }
    this.logs[serviceId].add("system", `${definition.label} stopped.`);

    if (sibling) {
      const siblingClosed = await this.#waitForPortToClose(
        sibling.port,
        this.sharedSiblingSettleMilliseconds,
      );
      if (siblingClosed) {
        this.logs[sibling.serviceId].add(
          "system",
          "The shared dev:web wrapper also stopped this service; restarting it separately…",
        );
        await this.start(sibling.serviceId);
      }
    }
  }

  async #sharedSiblingSnapshot(serviceId, inspection) {
    if (!inspection.sharedTargets?.length) return null;
    const siblingDefinition =
      serviceId === "admin"
        ? FRONTEND_DEFINITIONS.mobileWeb
        : FRONTEND_DEFINITIONS.admin;
    if (!(await this.portProbe(siblingDefinition.port))) return null;
    const siblingInspection = await this.processInspector.inspectPort(
      siblingDefinition.port,
      siblingDefinition.id,
      { fresh: true },
    );
    if (siblingInspection.ownership !== "verified-repository") return null;
    const sharedPids = new Set(
      inspection.sharedTargets.map((target) => target.pid),
    );
    if (
      !siblingInspection.sharedTargets?.some((target) =>
        sharedPids.has(target.pid),
      )
    ) {
      return null;
    }
    const siblingServiceId =
      siblingInspection.mode === "iphone-metro"
        ? "iphoneMetro"
        : siblingDefinition.id;
    return {
      serviceId: siblingServiceId,
      port: siblingDefinition.port,
    };
  }

  async #waitForPortToClose(port, milliseconds) {
    const deadline = Date.now() + milliseconds;
    do {
      if (!(await this.portProbe(port))) return true;
      if (Date.now() >= deadline) break;
      await timeout(Math.min(150, Math.max(1, deadline - Date.now())));
    } while (Date.now() <= deadline);
    return !(await this.portProbe(port));
  }

  async refreshSupabaseStatus() {
    return this.#enqueueSupabase(async () => {
      const result = await this.#runOneShot(
        "supabase",
        SUPABASE_COMMANDS.status,
        {
          timeoutMs: 25_000,
        },
      );
      this.supabase.checkedAt = new Date().toISOString();
      if (result.code === 0) {
        this.supabase.lifecycle = "running";
        this.supabase.lastError = null;
      } else {
        this.supabase.lifecycle = "stopped";
        this.supabase.lastError = null;
      }
    });
  }

  async startSupabase() {
    return this.#enqueueSupabase(async () => {
      const status = await this.#runOneShot(
        "supabase",
        SUPABASE_COMMANDS.status,
        {
          timeoutMs: 25_000,
        },
      );
      if (status.code === 0) {
        this.supabase.lifecycle = "running";
        this.supabase.lastError = null;
        this.supabase.checkedAt = new Date().toISOString();
        return;
      }

      this.supabase.lifecycle = "starting";
      this.supabase.lastError = null;
      this.logs.supabase.add("system", "Starting the local Supabase stack…");
      const result = await this.#runOneShot(
        "supabase",
        SUPABASE_COMMANDS.start,
        {
          timeoutMs: 180_000,
        },
      );
      if (result.code === 0) {
        this.supabase.lifecycle = "running";
        this.logs.supabase.add("system", "Local Supabase is running.");
      } else {
        this.supabase.lifecycle = "error";
        this.supabase.lastError =
          "Could not start local Supabase. Check that Docker Desktop is running.";
        this.logs.supabase.add("system", this.supabase.lastError);
      }
      this.supabase.checkedAt = new Date().toISOString();
    });
  }

  async stopSupabase() {
    return this.#enqueueSupabase(async () => {
      const status = await this.#runOneShot(
        "supabase",
        SUPABASE_COMMANDS.status,
        {
          timeoutMs: 25_000,
        },
      );
      if (status.code !== 0) {
        this.supabase.lifecycle = "stopped";
        this.supabase.lastError = null;
        this.supabase.checkedAt = new Date().toISOString();
        return;
      }

      this.supabase.lifecycle = "stopping";
      this.supabase.lastError = null;
      this.logs.supabase.add(
        "system",
        "Stopping this project's local Supabase stack…",
      );
      const result = await this.#runOneShot(
        "supabase",
        SUPABASE_COMMANDS.stop,
        {
          timeoutMs: 120_000,
        },
      );
      if (result.code === 0) {
        this.supabase.lifecycle = "stopped";
        this.logs.supabase.add("system", "Local Supabase stopped.");
      } else {
        this.supabase.lifecycle = "error";
        this.supabase.lastError =
          "Could not stop this project's local Supabase stack.";
        this.logs.supabase.add("system", this.supabase.lastError);
      }
      this.supabase.checkedAt = new Date().toISOString();
    });
  }

  async shutdown() {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    for (const child of this.oneShotChildren)
      this.#signalChild(child, "SIGTERM");
    await this.#stopManagedFrontends();
  }

  #captureChildOutput(serviceId, child) {
    for (const stream of ["stdout", "stderr"]) {
      const capture = new LineCapture((line) =>
        this.logs[serviceId].add(stream, line),
      );
      child[stream]?.on("data", (chunk) => capture.write(chunk));
      child[stream]?.once("end", () => capture.end());
    }
  }

  #signalChild(child, signal) {
    try {
      if (process.platform !== "win32" && child.pid) {
        process.kill(-child.pid, signal);
      } else {
        child.kill(signal);
      }
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }

  #enqueueSupabase(operation) {
    const queued = this.supabaseQueue.then(operation, operation);
    this.supabaseQueue = queued.catch(() => undefined);
    this.supabase.operation = queued;
    const clearCurrentOperation = () => {
      if (this.supabase.operation === queued) this.supabase.operation = null;
    };
    void queued.then(clearCurrentOperation, clearCurrentOperation);
    return queued;
  }

  #runOneShot(serviceId, command, { timeoutMs }) {
    return new Promise((resolve) => {
      const [file, ...args] = command;
      const child = this.spawnProcess(file, args, {
        cwd: this.repositoryRoot,
        env: { ...process.env, NO_COLOR: "1" },
        stdio: ["ignore", "ignore", "ignore"],
      });
      this.oneShotChildren.add(child);
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.oneShotChildren.delete(child);
        resolve(result);
      };
      const timer = setTimeout(() => {
        this.#signalChild(child, "SIGTERM");
        finish({ code: null, signal: "SIGTERM", timedOut: true });
      }, timeoutMs);
      child.once("error", () =>
        finish({ code: null, signal: null, timedOut: false }),
      );
      child.once("exit", (code, signal) =>
        finish({ code, signal, timedOut: false }),
      );
      void serviceId;
    });
  }
}
