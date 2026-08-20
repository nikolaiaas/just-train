#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { stat, readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  InputError,
  isAllowedHost,
  isSameOriginRequest,
  resolveStaticPath,
  validateActionRequest,
  validateTaskReorderRequest,
  validateTaskRequest,
  validateTaskStatus,
} from "./core.mjs";
import { ServiceManager } from "./service-manager.mjs";
import { TaskStore } from "./task-store.mjs";

export const DEV_CONSOLE_HOST = "127.0.0.1";
export const DEV_CONSOLE_PORT = 11009;
export const DEV_CONSOLE_URL = `http://${DEV_CONSOLE_HOST}:${DEV_CONSOLE_PORT}`;
export const DEV_CONSOLE_APP_ID = "bare-traen-dev-console";

const execFileAsync = promisify(execFile);
const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultConsoleDirectory = path.resolve(sourceDirectory, "..");
const defaultRepositoryRoot = path.resolve(defaultConsoleDirectory, "../..");
const SHELL_ROUTES = new Set(["/", "/services", "/tasks"]);
const CONTENT_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
});
const SECURITY_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});

function sendJson(response, statusCode, body, requestMethod = "GET") {
  const payload = `${JSON.stringify(body)}\n`;
  response.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  response.end(requestMethod === "HEAD" ? undefined : payload);
}

function sendError(response, error, requestMethod = "GET") {
  const statusCode = Number.isInteger(error?.statusCode)
    ? error.statusCode
    : 500;
  const code = typeof error?.code === "string" ? error.code : "internal_error";
  const message =
    statusCode >= 500 && code === "internal_error"
      ? "The development console encountered an unexpected error."
      : error?.message || "The request could not be completed.";
  sendJson(
    response,
    statusCode,
    { ok: false, error: { code, message } },
    requestMethod,
  );
}

function validateMutationRequest(request, csrfToken, port) {
  const host = request.headers.host;
  const origin = request.headers.origin;
  if (!isSameOriginRequest(origin, host, port)) {
    throw new InputError(
      "This action is allowed only from the local console page.",
      {
        code: "invalid_origin",
        statusCode: 403,
      },
    );
  }
  if (
    request.headers["sec-fetch-site"] &&
    request.headers["sec-fetch-site"] !== "same-origin"
  ) {
    throw new InputError("Cross-site actions are not allowed.", {
      code: "invalid_origin",
      statusCode: 403,
    });
  }
  const suppliedToken = request.headers["x-csrf-token"];
  if (
    typeof suppliedToken !== "string" ||
    !tokensMatch(suppliedToken, csrfToken)
  ) {
    throw new InputError(
      "The page security token is missing or expired. Refresh the page.",
      {
        code: "invalid_csrf_token",
        statusCode: 403,
      },
    );
  }
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new InputError("Actions require an application/json body.", {
      code: "invalid_content_type",
      statusCode: 415,
    });
  }
}

function tokensMatch(supplied, expected) {
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

async function readJsonBody(request, maximumBytes = 64 * 1024) {
  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new InputError("Request body is too large.", {
      code: "request_too_large",
      statusCode: 413,
    });
  }

  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maximumBytes) {
      throw new InputError("Request body is too large.", {
        code: "request_too_large",
        statusCode: 413,
      });
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new InputError("Request body must be valid JSON.");
  }
}

export async function collectGitSummary(
  repositoryRoot = defaultRepositoryRoot,
) {
  const options = {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 256 * 1024,
    timeout: 3_000,
    windowsHide: true,
  };
  try {
    const [branchResult, statusResult] = await Promise.all([
      execFileAsync("git", ["branch", "--show-current"], options),
      execFileAsync(
        "git",
        ["status", "--porcelain=v1", "--untracked-files=normal"],
        options,
      ),
    ]);
    const branch = branchResult.stdout
      .trim()
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .slice(0, 128);
    const changedCount = statusResult.stdout
      .split("\n")
      .filter((line) => line.length > 0).length;
    return {
      branch: branch || "detached HEAD",
      clean: changedCount === 0,
      changedCount,
    };
  } catch {
    return { branch: "unavailable", clean: false, changedCount: null };
  }
}

export function repositoryIdentity(repositoryRoot) {
  return createHash("sha256")
    .update(path.resolve(repositoryRoot))
    .digest("hex")
    .slice(0, 16);
}

export function createDevConsole({
  host = DEV_CONSOLE_HOST,
  port = DEV_CONSOLE_PORT,
  repositoryRoot = defaultRepositoryRoot,
  publicDirectory = path.join(defaultConsoleDirectory, "dist"),
  taskFile = path.join(defaultConsoleDirectory, "tasks.json"),
  manager = new ServiceManager({ repositoryRoot }),
  taskStore = new TaskStore(taskFile),
} = {}) {
  const csrfToken = randomBytes(32).toString("base64url");
  const startedAt = new Date().toISOString();
  const consoleUrl = `http://${host}:${port}`;
  const repositoryId = repositoryIdentity(repositoryRoot);

  async function getState() {
    const [services, tasks, git] = await Promise.all([
      manager.getServiceStates(),
      taskStore.read(),
      collectGitSummary(repositoryRoot),
    ]);
    return {
      csrfToken,
      console: { url: consoleUrl, startedAt },
      git,
      services,
      logs: manager.getLogs(),
      tasks,
    };
  }

  const server = http.createServer(async (request, response) => {
    try {
      if (!isAllowedHost(request.headers.host, port)) {
        throw new InputError("Invalid local console host.", {
          code: "invalid_host",
          statusCode: 403,
        });
      }

      const url = new URL(request.url ?? "/", consoleUrl);
      const method = request.method ?? "GET";

      if (url.pathname === "/api/health") {
        if (method !== "GET" && method !== "HEAD") {
          throw new InputError("Method not allowed.", {
            code: "method_not_allowed",
            statusCode: 405,
          });
        }
        sendJson(
          response,
          200,
          { ok: true, app: DEV_CONSOLE_APP_ID, repositoryId },
          method,
        );
        return;
      }

      if (url.pathname === "/api/state") {
        if (method !== "GET" && method !== "HEAD") {
          throw new InputError("Method not allowed.", {
            code: "method_not_allowed",
            statusCode: 405,
          });
        }
        sendJson(response, 200, await getState(), method);
        return;
      }

      if (url.pathname === "/api/actions") {
        if (method !== "POST") {
          throw new InputError("Method not allowed.", {
            code: "method_not_allowed",
            statusCode: 405,
          });
        }
        validateMutationRequest(request, csrfToken, port);
        const action = validateActionRequest(await readJsonBody(request));
        await manager.perform(action);
        sendJson(response, 200, { ok: true, state: await getState() }, method);
        return;
      }

      if (url.pathname === "/api/tasks") {
        if (method !== "POST") {
          throw new InputError("Method not allowed.", {
            code: "method_not_allowed",
            statusCode: 405,
          });
        }
        validateMutationRequest(request, csrfToken, port);
        const action = validateTaskRequest(await readJsonBody(request));
        let tasks;
        if (action.action === "create")
          tasks = await taskStore.create(action.task);
        if (action.action === "update") {
          tasks = await taskStore.update(action.id, action.changes);
        }
        if (action.action === "delete")
          tasks = await taskStore.delete(action.id);
        sendJson(response, 200, { ok: true, tasks }, method);
        return;
      }

      if (url.pathname === "/api/tasks/reorder") {
        if (method !== "POST") {
          throw new InputError("Method not allowed.", {
            code: "method_not_allowed",
            statusCode: 405,
          });
        }
        validateMutationRequest(request, csrfToken, port);
        const { taskId, status, beforeTaskId } = validateTaskReorderRequest(
          await readJsonBody(request),
        );
        const tasks = await taskStore.reorder(taskId, status, beforeTaskId);
        sendJson(response, 200, { ok: true, tasks }, method);
        return;
      }

      const statusRoute = url.pathname.match(/^\/api\/tasks\/([^/]+)\/status$/);
      if (statusRoute) {
        if (method !== "POST") {
          throw new InputError("Method not allowed.", {
            code: "method_not_allowed",
            statusCode: 405,
          });
        }
        validateMutationRequest(request, csrfToken, port);
        const body = await readJsonBody(request);
        if (
          body === null ||
          typeof body !== "object" ||
          Array.isArray(body) ||
          Object.keys(body).length !== 1 ||
          !Object.hasOwn(body, "status")
        ) {
          throw new InputError("Status update accepts only a status field.");
        }
        let taskId;
        try {
          taskId = decodeURIComponent(statusRoute[1]);
        } catch {
          throw new InputError("Invalid task id encoding.");
        }
        const tasks = await taskStore.update(taskId, {
          status: validateTaskStatus(body.status),
        });
        sendJson(response, 200, { ok: true, tasks }, method);
        return;
      }

      if (method !== "GET" && method !== "HEAD") {
        throw new InputError("Method not allowed.", {
          code: "method_not_allowed",
          statusCode: 405,
        });
      }
      const staticPath = SHELL_ROUTES.has(url.pathname) ? "/" : url.pathname;
      const filePath = resolveStaticPath(publicDirectory, staticPath);
      let fileStats;
      try {
        fileStats = await stat(filePath);
      } catch (error) {
        if (error?.code === "ENOENT") {
          throw new InputError("Page not found.", {
            code: "not_found",
            statusCode: 404,
          });
        }
        throw error;
      }
      if (!fileStats.isFile()) {
        throw new InputError("Page not found.", {
          code: "not_found",
          statusCode: 404,
        });
      }
      const contents = await readFile(filePath);
      response.writeHead(200, {
        ...SECURITY_HEADERS,
        "Content-Type":
          CONTENT_TYPES[path.extname(filePath).toLowerCase()] ??
          "application/octet-stream",
        "Content-Length": contents.length,
      });
      response.end(method === "HEAD" ? undefined : contents);
    } catch (error) {
      sendError(response, error, request.method);
    }
  });

  async function listen() {
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, host);
    });
    void manager.initialize().catch(() => undefined);
  }

  async function close() {
    await manager.shutdown();
    await new Promise((resolve) => server.close(resolve));
    server.closeIdleConnections?.();
  }

  return {
    server,
    manager,
    taskStore,
    getState,
    listen,
    close,
    csrfToken,
    consoleUrl,
  };
}

function openConsole(url) {
  const command =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? null
        : ["xdg-open", [url]];
  if (!command) return;
  const child = spawn(command[0], command[1], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

async function main() {
  const app = createDevConsole();
  await app.listen();
  process.stdout.write(`Bare Træn Dev Console: ${app.consoleUrl}\n`);
  if (process.argv.includes("--open")) openConsole(app.consoleUrl);

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await app.close();
  };
  process.once("SIGINT", () => void shutdown().then(() => process.exit(0)));
  process.once("SIGTERM", () => void shutdown().then(() => process.exit(0)));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    const message =
      error?.code === "EADDRINUSE"
        ? `Port ${DEV_CONSOLE_PORT} is already in use. The Dev Console may already be open.`
        : "Bare Træn Dev Console could not start.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
