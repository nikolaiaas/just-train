import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";

import {
  InputError,
  TASK_BOARD_VERSION,
  validateTask,
  validateTaskBoard,
  validateTaskChanges,
  validateTaskId,
  validateTaskStatus,
} from "./core.mjs";

const EMPTY_BOARD = Object.freeze({
  version: TASK_BOARD_VERSION,
  updatedAt: null,
  items: [],
});

export class TaskStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.writeQueue = Promise.resolve();
  }

  read() {
    return this.#enqueue(() => this.#readUnlocked());
  }

  async #readUnlocked() {
    try {
      const source = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(source);
      const board = validateTaskBoard(parsed, {
        migrateLegacyStatuses: true,
        migratePriorities: true,
      });
      if (boardOrderingSignature(parsed) !== boardOrderingSignature(board)) {
        await this.#atomicWrite(board);
      }
      return board;
    } catch (error) {
      if (error?.code === "ENOENT") {
        return structuredClone(EMPTY_BOARD);
      }
      if (error instanceof SyntaxError) {
        throw new InputError("The task board contains invalid JSON.", {
          code: "invalid_task_board",
          statusCode: 500,
        });
      }
      if (error instanceof InputError) {
        error.code = "invalid_task_board";
        error.statusCode = 500;
      }
      throw error;
    }
  }

  create(taskInput) {
    return this.#mutate((board) => {
      const now = new Date().toISOString();
      const task = validateTask(taskInput);
      board.items.push({
        id: randomUUID(),
        ...task,
        priority: board.items.filter((item) => item.status === task.status)
          .length,
        createdAt: now,
        updatedAt: now,
      });
      return board;
    });
  }

  update(idInput, changesInput) {
    return this.#mutate((board) => {
      const id = validateTaskId(idInput);
      const changes = validateTaskChanges(changesInput);
      const index = board.items.findIndex((task) => task.id === id);
      if (index === -1) {
        throw new InputError("Task not found.", {
          code: "task_not_found",
          statusCode: 404,
        });
      }
      const existing = board.items[index];
      const statusChanged =
        changes.status !== undefined && changes.status !== existing.status;
      board.items[index] = {
        ...existing,
        ...changes,
        priority: statusChanged
          ? board.items.filter(
              (task) => task.id !== id && task.status === changes.status,
            ).length
          : existing.priority,
        updatedAt: new Date().toISOString(),
      };
      return board;
    });
  }

  delete(idInput) {
    return this.#mutate((board) => {
      const id = validateTaskId(idInput);
      const index = board.items.findIndex((task) => task.id === id);
      if (index === -1) {
        throw new InputError("Task not found.", {
          code: "task_not_found",
          statusCode: 404,
        });
      }
      board.items.splice(index, 1);
      return board;
    });
  }

  reorder(taskIdInput, statusInput, beforeTaskIdInput) {
    return this.#mutate((board) => {
      const taskId = validateTaskId(taskIdInput);
      const status = validateTaskStatus(statusInput);
      const beforeTaskId =
        beforeTaskIdInput === null ? null : validateTaskId(beforeTaskIdInput);
      if (beforeTaskId === taskId) {
        throw new InputError("A task cannot be placed before itself.");
      }

      const movingIndex = board.items.findIndex((task) => task.id === taskId);
      if (movingIndex === -1) {
        throw new InputError("Task not found.", {
          code: "task_not_found",
          statusCode: 404,
        });
      }
      const [movingTask] = board.items.splice(movingIndex, 1);
      const targetColumn = board.items
        .filter((task) => task.status === status)
        .sort((first, second) => first.priority - second.priority);

      let insertionIndex = targetColumn.length;
      if (beforeTaskId !== null) {
        const beforeIndex = targetColumn.findIndex(
          (task) => task.id === beforeTaskId,
        );
        if (beforeIndex === -1) {
          const targetExists = board.items.some(
            (task) => task.id === beforeTaskId,
          );
          throw new InputError(
            targetExists
              ? "The beforeTaskId task is not in the requested status column."
              : "The beforeTaskId task no longer exists.",
            {
              code: targetExists
                ? "invalid_reorder_target"
                : "reorder_target_not_found",
              statusCode: 409,
            },
          );
        }
        insertionIndex = beforeIndex;
      }

      const moved = {
        ...movingTask,
        status,
        updatedAt: new Date().toISOString(),
      };
      targetColumn.splice(insertionIndex, 0, moved);
      targetColumn.forEach((task, priority) => {
        task.priority = priority;
      });
      board.items.push(moved);
      return board;
    });
  }

  #mutate(operation) {
    return this.#enqueue(async () => {
      const board = await this.#readUnlocked();
      const nextBoard = operation(board);
      nextBoard.updatedAt = new Date().toISOString();
      const validated = validateTaskBoard(nextBoard, {
        migratePriorities: true,
      });
      await this.#atomicWrite(validated);
      return validated;
    });
  }

  #enqueue(operation) {
    const pending = this.writeQueue.then(operation, operation);
    this.writeQueue = pending.catch(() => undefined);
    return pending;
  }

  async #atomicWrite(board) {
    const directory = path.dirname(this.filePath);
    await mkdir(directory, { recursive: true });
    const temporaryPath = path.join(
      directory,
      `.${path.basename(this.filePath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    let handle;
    try {
      handle = await open(temporaryPath, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify(board, null, 2)}\n`, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      if (handle) await handle.close().catch(() => undefined);
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }
}

function boardOrderingSignature(board) {
  if (!board || !Array.isArray(board.items)) return "invalid";
  return JSON.stringify({
    version: board.version,
    items: board.items.map((task) => ({
      id: task?.id,
      status: task?.status,
      priority: task?.priority,
    })),
  });
}
