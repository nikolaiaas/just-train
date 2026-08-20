import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";

import { InputError } from "../server/core.mjs";
import { TaskStore } from "../server/task-store.mjs";

const temporaryDirectories = [];

async function makeStore() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "bare-traen-task-store-"),
  );
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, "tasks.json");
  return { directory, filePath, store: new TaskStore(filePath) };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("TaskStore", () => {
  test("returns an empty board when no file exists", async () => {
    const { store } = await makeStore();
    assert.deepEqual(await store.read(), {
      version: 2,
      updatedAt: null,
      items: [],
    });
  });

  test("appends creates and status changes, then reindexes deletes", async () => {
    const { directory, filePath, store } = await makeStore();
    const first = await store.create({
      title: "First todo",
      details: "",
      status: "todo",
    });
    const firstId = first.items[0].id;
    assert.match(firstId, /^[a-z0-9-]+$/);
    assert.equal(first.items[0].priority, 0);

    const second = await store.create({
      title: "Second todo",
      details: "",
      status: "todo",
    });
    const secondId = second.items.find((task) => task.id !== firstId).id;
    assert.deepEqual(column(second, "todo"), [
      [firstId, 0],
      [secondId, 1],
    ]);

    const withDoing = await store.create({
      title: "Existing doing",
      details: "",
      status: "doing",
    });
    const existingDoingId = withDoing.items.find(
      (task) => task.status === "doing",
    ).id;

    let board = await store.update(firstId, { status: "doing" });
    assert.deepEqual(column(board, "todo"), [[secondId, 0]]);
    assert.deepEqual(column(board, "doing"), [
      [existingDoingId, 0],
      [firstId, 1],
    ]);

    board = await store.delete(existingDoingId);
    assert.deepEqual(column(board, "doing"), [[firstId, 0]]);

    const persisted = JSON.parse(await readFile(filePath, "utf8"));
    assert.equal(persisted.version, 2);
    assert.deepEqual(column(persisted, "doing"), [[firstId, 0]]);
    assert.deepEqual(
      (await readdir(directory)).filter((name) => name.endsWith(".tmp")),
      [],
    );

    board = await store.delete(firstId);
    assert.deepEqual(column(board, "doing"), []);
  });

  test("serializes concurrent writes without losing tasks", async () => {
    const { store } = await makeStore();
    const [first, second] = await Promise.all([
      store.create({ title: "First", details: "", status: "todo" }),
      store.create({ title: "Second", details: "", status: "todo" }),
    ]);
    assert.equal(first.items.length, 1);
    assert.equal(second.items.length, 2);
    assert.deepEqual(
      column(await store.read(), "todo").map(([, priority]) => priority),
      [0, 1],
    );
  });

  test("fails closed when the existing board is malformed", async () => {
    const { filePath, store } = await makeStore();
    await writeFile(filePath, '{"version":1,"items":"not-an-array"}\n', "utf8");
    await assert.rejects(
      () => store.read(),
      (error) => {
        assert.ok(error instanceof InputError);
        assert.equal(error.code, "invalid_task_board");
        assert.equal(error.statusCode, 500);
        return true;
      },
    );
  });

  test("migrates version 1 statuses and file order to version 2 priorities", async () => {
    const { filePath, store } = await makeStore();
    const timestamp = "2026-08-20T12:00:00.000Z";
    await writeFile(
      filePath,
      `${JSON.stringify({
        version: 1,
        updatedAt: timestamp,
        items: [
          {
            id: "active-first",
            title: "Active first",
            details: "",
            status: "in-progress",
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          {
            id: "blocked-task",
            title: "Blocked",
            details: "",
            status: "blocked",
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          {
            id: "todo-first",
            title: "Todo first",
            details: "",
            status: "todo",
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          {
            id: "active-second",
            title: "Active second",
            details: "",
            status: "in-progress",
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          {
            id: "todo-second",
            title: "Todo second",
            details: "",
            status: "todo",
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      })}\n`,
      "utf8",
    );

    const migrated = await store.read();
    assert.equal(migrated.version, 2);
    assert.deepEqual(column(migrated, "backlog"), [["blocked-task", 0]]);
    assert.deepEqual(column(migrated, "todo"), [
      ["todo-first", 0],
      ["todo-second", 1],
    ]);
    assert.deepEqual(column(migrated, "doing"), [
      ["active-first", 0],
      ["active-second", 1],
    ]);

    const persisted = JSON.parse(await readFile(filePath, "utf8"));
    assert.deepEqual(persisted, migrated);
    assert.deepEqual(
      (await readdir(path.dirname(filePath))).filter((name) =>
        name.endsWith(".tmp"),
      ),
      [],
    );
  });

  test("migrates missing version 2 priorities using file order per status", async () => {
    const { filePath, store } = await makeStore();
    const timestamp = "2026-08-20T12:00:00.000Z";
    const persistedTask = (id, priority) => ({
      id,
      title: id,
      details: "",
      status: "todo",
      ...(priority === undefined ? {} : { priority }),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await writeFile(
      filePath,
      `${JSON.stringify({
        version: 2,
        updatedAt: timestamp,
        items: [
          persistedTask("file-first", 7),
          persistedTask("file-second"),
          persistedTask("file-third", 0),
        ],
      })}\n`,
      "utf8",
    );

    const migrated = await store.read();
    assert.deepEqual(column(migrated, "todo"), [
      ["file-first", 0],
      ["file-second", 1],
      ["file-third", 2],
    ]);
    assert.deepEqual(JSON.parse(await readFile(filePath, "utf8")), migrated);
  });

  test("reorders within a column and appends when beforeTaskId is null", async () => {
    const { store } = await makeStore();
    const firstBoard = await store.create({
      title: "First",
      details: "",
      status: "todo",
    });
    const firstId = firstBoard.items[0].id;
    const secondBoard = await store.create({
      title: "Second",
      details: "",
      status: "todo",
    });
    const secondId = secondBoard.items.at(-1).id;
    const thirdBoard = await store.create({
      title: "Third",
      details: "",
      status: "todo",
    });
    const thirdId = thirdBoard.items.at(-1).id;

    let board = await store.reorder(thirdId, "todo", firstId);
    assert.deepEqual(column(board, "todo"), [
      [thirdId, 0],
      [firstId, 1],
      [secondId, 2],
    ]);

    board = await store.reorder(firstId, "todo", null);
    assert.deepEqual(column(board, "todo"), [
      [thirdId, 0],
      [secondId, 1],
      [firstId, 2],
    ]);
  });

  test("reorders across columns and normalizes source and target", async () => {
    const { store } = await makeStore();
    const firstTodo = await store.create({
      title: "First todo",
      details: "",
      status: "todo",
    });
    const firstTodoId = firstTodo.items[0].id;
    const secondTodo = await store.create({
      title: "Second todo",
      details: "",
      status: "todo",
    });
    const secondTodoId = column(secondTodo, "todo")[1][0];
    const firstDoing = await store.create({
      title: "First doing",
      details: "",
      status: "doing",
    });
    const firstDoingId = column(firstDoing, "doing")[0][0];
    const secondDoing = await store.create({
      title: "Second doing",
      details: "",
      status: "doing",
    });
    const secondDoingId = column(secondDoing, "doing")[1][0];

    const board = await store.reorder(secondTodoId, "doing", secondDoingId);
    assert.deepEqual(column(board, "todo"), [[firstTodoId, 0]]);
    assert.deepEqual(column(board, "doing"), [
      [firstDoingId, 0],
      [secondTodoId, 1],
      [secondDoingId, 2],
    ]);
  });

  test("rejects unknown and invalid reorder targets without changing data", async () => {
    const { store } = await makeStore();
    const todo = await store.create({
      title: "Todo",
      details: "",
      status: "todo",
    });
    const todoId = column(todo, "todo")[0][0];
    const doing = await store.create({
      title: "Doing",
      details: "",
      status: "doing",
    });
    const doingId = column(doing, "doing")[0][0];

    await assert.rejects(
      () => store.reorder("missing-task", "todo", null),
      (error) => error.code === "task_not_found" && error.statusCode === 404,
    );
    await assert.rejects(
      () => store.reorder(todoId, "todo", "stale-task"),
      (error) =>
        error.code === "reorder_target_not_found" && error.statusCode === 409,
    );
    await assert.rejects(
      () => store.reorder(todoId, "todo", doingId),
      (error) =>
        error.code === "invalid_reorder_target" && error.statusCode === 409,
    );
    await assert.rejects(
      () => store.reorder(todoId, "todo", todoId),
      /before itself/,
    );
    assert.deepEqual(column(await store.read(), "todo"), [[todoId, 0]]);
    assert.deepEqual(column(await store.read(), "doing"), [[doingId, 0]]);
  });
});

function column(board, status) {
  return board.items
    .filter((task) => task.status === status)
    .sort((first, second) => first.priority - second.priority)
    .map(({ id, priority }) => [id, priority]);
}
