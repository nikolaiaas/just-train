import "server-only";

import type { BareTraenClient } from "@bare-traen/api-client";

import type { AdminProfile } from "@/lib/auth/access";

import { auditCreatorLabel } from "./audit-display";

export type AiPromptVersion = {
  id: string;
  version: number;
  promptTemplate: string;
  gateway: string;
  provider: string;
  model: string;
  maxAttempts: number;
  timeoutMs: number;
  maxCostMicrousd: number;
  createdAt: string;
  createdByLabel: string;
};

export type AiPromptOperation = {
  operationKey: string;
  capability: string;
  description: string;
  activeVersionId: string | null;
  activeVersion: AiPromptVersion | null;
  versions: AiPromptVersion[];
};

export type AiPromptCatalog =
  { kind: "ready"; operations: AiPromptOperation[] } | { kind: "unavailable" };

type OperationRow = {
  id: string;
  operation_key: string;
  capability: string;
  description: string;
  active_version_id: string | null;
};

type VersionRow = {
  id: string;
  operation_id: string;
  version: number;
  prompt_template: string;
  gateway: string;
  provider: string;
  model: string;
  max_attempts: number;
  timeout_ms: number;
  max_cost_microusd: number;
  created_by: string | null;
  created_at: string;
};

function toVersion(row: VersionRow, profile: AdminProfile): AiPromptVersion {
  return {
    id: row.id,
    version: row.version,
    promptTemplate: row.prompt_template,
    gateway: row.gateway,
    provider: row.provider,
    model: row.model,
    maxAttempts: row.max_attempts,
    timeoutMs: row.timeout_ms,
    maxCostMicrousd: row.max_cost_microusd,
    createdAt: row.created_at,
    createdByLabel: auditCreatorLabel(row.created_by, profile.id),
  };
}

export async function getAiPromptCatalog(
  client: BareTraenClient,
  profile: AdminProfile,
): Promise<AiPromptCatalog> {
  const [operationResult, versionResult] = await Promise.all([
    client
      .from("ai_operations")
      .select("id, operation_key, capability, description, active_version_id")
      .order("operation_key", { ascending: true }),
    client
      .from("ai_operation_versions")
      .select(
        "id, operation_id, version, prompt_template, gateway, provider, model, max_attempts, timeout_ms, max_cost_microusd, created_by, created_at",
      )
      .order("version", { ascending: false }),
  ]);

  if (operationResult.error || versionResult.error) {
    return { kind: "unavailable" };
  }

  const versionsByOperation = new Map<string, AiPromptVersion[]>();

  for (const row of (versionResult.data ?? []) as VersionRow[]) {
    const versions = versionsByOperation.get(row.operation_id) ?? [];
    versions.push(toVersion(row, profile));
    versionsByOperation.set(row.operation_id, versions);
  }

  const operations = ((operationResult.data ?? []) as OperationRow[]).map(
    (operation) => {
      const versions = versionsByOperation.get(operation.id) ?? [];
      const activeVersion =
        versions.find(
          (version) => version.id === operation.active_version_id,
        ) ?? null;

      return {
        operationKey: operation.operation_key,
        capability: operation.capability,
        description: operation.description,
        activeVersionId: operation.active_version_id,
        activeVersion,
        versions,
      };
    },
  );

  return { kind: "ready", operations };
}
