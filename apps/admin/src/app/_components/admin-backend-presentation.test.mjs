import assert from "node:assert/strict";
import test from "node:test";

import { getAdminBackendPresentation } from "./admin-backend-presentation.ts";

test("names the local Supabase backend without relying on the browser environment", () => {
  assert.deepEqual(getAdminBackendPresentation("local"), {
    description: "Administrationen læser og gemmer i den lokale database.",
    label: "Lokal Supabase",
    tone: "local",
  });
});

test("names the shared hosted development backend distinctly", () => {
  assert.deepEqual(getAdminBackendPresentation("development"), {
    description:
      "Administrationen læser og gemmer i den delte hosted development-database.",
    label: "Hosted Development",
    tone: "hosted",
  });
});
