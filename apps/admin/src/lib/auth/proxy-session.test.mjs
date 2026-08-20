import assert from "node:assert/strict";
import test from "node:test";

import { shouldRefreshAuthForPath } from "./proxy-session.ts";

test("refreshes application routes but skips static assets", () => {
  for (const pathname of ["/", "/login", "/auth/callback", "/emner/fixture"]) {
    assert.equal(shouldRefreshAuthForPath(pathname), true, pathname);
  }

  for (const pathname of [
    "/_next/static/chunk.js",
    "/_next/image/example",
    "/favicon.ico",
    "/logo.svg",
    "/fonts/admin.woff2",
  ]) {
    assert.equal(shouldRefreshAuthForPath(pathname), false, pathname);
  }
});
