#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ServiceManager } from "./service-manager.mjs";

export const ADMIN_PREVIEW_URL = "http://localhost:11000";

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(sourceDirectory, "../../..");

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class AdminPreviewCancelledError extends Error {
  constructor() {
    super("Administration preview startup was cancelled.");
    this.name = "AdminPreviewCancelledError";
  }
}

export async function isAdminPreviewReady({
  fetchImpl = fetch,
  timeoutMs = 1_500,
  url = ADMIN_PREVIEW_URL,
} = {}) {
  try {
    const response = await fetchImpl(url, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.status >= 200 && response.status <= 499;
  } catch {
    return false;
  }
}

export async function waitForAdminPreview({
  intervalMs = 250,
  isCancelled = () => false,
  probe = isAdminPreviewReady,
  timeoutMs = 30_000,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (isCancelled()) return false;
    if (await probe()) return true;
    if (isCancelled()) return false;
    if (Date.now() >= deadline) return false;
    await delay(Math.min(intervalMs, Math.max(1, deadline - Date.now())));
  } while (Date.now() <= deadline);
  return false;
}

export async function monitorAdminPreview({
  intervalMs = 500,
  isCancelled = () => false,
  manager,
} = {}) {
  if (!manager) {
    throw new TypeError("An admin preview service manager is required.");
  }
  while (!isCancelled()) {
    const state = (await manager.getServiceStates()).admin;
    if (state.status !== "running" || !state.managed) {
      throw new Error("Administration stopped unexpectedly.");
    }
    await delay(intervalMs);
  }
}

export async function startAdminPreview({
  isCancelled = () => false,
  manager,
  probe = isAdminPreviewReady,
  staleTimeoutMs = 10_000,
  startupTimeoutMs = 30_000,
  waitForReady = waitForAdminPreview,
} = {}) {
  if (!manager) {
    throw new TypeError("An admin preview service manager is required.");
  }
  if (isCancelled()) throw new AdminPreviewCancelledError();

  const initialState = (await manager.getServiceStates()).admin;
  if (
    initialState.status === "external" &&
    initialState.ownership === "verified-repository"
  ) {
    const responsive = await waitForReady({
      isCancelled,
      probe,
      timeoutMs: staleTimeoutMs,
    });
    if (isCancelled()) throw new AdminPreviewCancelledError();
    if (responsive) {
      const reusedState = (await manager.getServiceStates()).admin;
      if (
        reusedState.status === "external" &&
        reusedState.ownership === "verified-repository" &&
        (await probe())
      ) {
        return { managed: false, restarted: false, reused: true };
      }
    }
    const refreshedState = (await manager.getServiceStates()).admin;
    if (isCancelled()) throw new AdminPreviewCancelledError();
    if (refreshedState.status !== "stopped") {
      await manager.stop("admin");
    }
  }

  if (isCancelled()) throw new AdminPreviewCancelledError();
  await manager.start("admin");
  if (isCancelled()) throw new AdminPreviewCancelledError();
  const ready = await waitForReady({
    isCancelled,
    probe,
    timeoutMs: startupTimeoutMs,
  });
  if (isCancelled()) throw new AdminPreviewCancelledError();
  if (!ready) {
    await manager.shutdown();
    throw new Error("Administration did not become ready in time.");
  }

  const currentState = (await manager.getServiceStates()).admin;
  const responsiveAfterStart = await probe();
  if (
    currentState.status === "external" &&
    currentState.ownership === "verified-repository" &&
    responsiveAfterStart
  ) {
    return {
      managed: false,
      restarted:
        initialState.status === "external" &&
        initialState.ownership === "verified-repository",
      reused: true,
    };
  }
  if (
    currentState.status !== "running" ||
    !currentState.managed ||
    !responsiveAfterStart
  ) {
    await manager.shutdown();
    throw new Error("Administration did not remain ready after startup.");
  }
  return {
    managed: true,
    restarted:
      initialState.status === "external" &&
      initialState.ownership === "verified-repository",
    reused: false,
  };
}

export async function runAdminPreviewCommand({
  manager,
  monitor = monitorAdminPreview,
  signalTarget = process,
  start = startAdminPreview,
  write = (message) => process.stdout.write(message),
} = {}) {
  if (!manager) {
    throw new TypeError("An admin preview service manager is required.");
  }

  let cancelled = false;
  const cancel = () => {
    cancelled = true;
  };
  signalTarget.on("SIGINT", cancel);
  signalTarget.on("SIGTERM", cancel);

  try {
    const result = await start({
      isCancelled: () => cancelled,
      manager,
    });
    if (cancelled) return { cancelled: true };

    write(`Bare Træn administration: ${ADMIN_PREVIEW_URL}\n`);
    if (result.managed) {
      await monitor({
        isCancelled: () => cancelled,
        manager,
      });
    }
    return cancelled ? { cancelled: true } : result;
  } catch (error) {
    if (cancelled || error instanceof AdminPreviewCancelledError) {
      return { cancelled: true };
    }
    throw error;
  } finally {
    try {
      await manager.shutdown();
    } finally {
      signalTarget.removeListener("SIGINT", cancel);
      signalTarget.removeListener("SIGTERM", cancel);
    }
  }
}

async function main() {
  const manager = new ServiceManager({
    repositoryRoot: defaultRepositoryRoot,
  });
  await runAdminPreviewCommand({ manager });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    const message =
      error?.code === "service_conflict"
        ? error.message
        : "Bare Træn administration could not start.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
