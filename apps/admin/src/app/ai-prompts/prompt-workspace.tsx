import type {
  AiPromptCatalog,
  AiPromptOperation,
  AiPromptVersion,
} from "./data";
import { PromptPublishForm } from "./publish-form";
import styles from "./prompt-workspace.module.css";

const auditDateFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Copenhagen",
});

const usdFormatter = new Intl.NumberFormat("da-DK", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

function auditTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Tidspunkt ikke tilgængeligt"
    : auditDateFormatter.format(date);
}

function costCeiling(value: number): string {
  return usdFormatter.format(value / 1_000_000);
}

function VersionAudit({
  version,
  active,
}: {
  version: AiPromptVersion;
  active: boolean;
}) {
  return (
    <article className={styles.historyCard}>
      <header className={styles.historyHeader}>
        <div>
          <strong>Version {version.version}</strong>
          {active ? <span className={styles.activeBadge}>Aktiv</span> : null}
        </div>
        <time dateTime={version.createdAt}>
          {auditTimestamp(version.createdAt)}
        </time>
      </header>
      <p className={styles.promptText}>{version.promptTemplate}</p>
      <dl className={styles.auditGrid}>
        <div>
          <dt>Udgivet af</dt>
          <dd>{version.createdByLabel}</dd>
        </div>
        <div>
          <dt>Serverrute</dt>
          <dd>
            {version.gateway} · {version.provider}
          </dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{version.model}</dd>
        </div>
        <div>
          <dt>Grænser</dt>
          <dd>
            {version.maxAttempts} forsøg · {version.timeoutMs / 1_000} sek. ·{" "}
            {costCeiling(version.maxCostMicrousd)}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function OperationWorkspace({ operation }: { operation: AiPromptOperation }) {
  const activeVersion = operation.activeVersion;

  return (
    <article className={styles.operationCard}>
      <header className={styles.operationHeader}>
        <div>
          <p className={styles.operationKey}>{operation.operationKey}</p>
          <h3>{operation.description || "AI-handling"}</h3>
          <p>{operation.capability}</p>
        </div>
        <span className={styles.serverOwnedBadge}>Serverstyret</span>
      </header>

      {activeVersion && operation.activeVersionId ? (
        <div className={styles.activeLayout}>
          <section
            className={styles.activePanel}
            aria-labelledby={`active-${activeVersion.id}`}
          >
            <div className={styles.activeHeading}>
              <div>
                <p className={styles.kicker}>Aktiv immutable version</p>
                <h3 id={`active-${activeVersion.id}`}>
                  Version {activeVersion.version}
                </h3>
              </div>
              <span className={styles.activeBadge}>Aktiv nu</span>
            </div>
            <p className={styles.promptText}>{activeVersion.promptTemplate}</p>
            <dl className={styles.auditGrid}>
              <div>
                <dt>Udgivet</dt>
                <dd>
                  <time dateTime={activeVersion.createdAt}>
                    {auditTimestamp(activeVersion.createdAt)}
                  </time>
                </dd>
              </div>
              <div>
                <dt>Udgivet af</dt>
                <dd>{activeVersion.createdByLabel}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{activeVersion.model}</dd>
              </div>
              <div>
                <dt>Provider</dt>
                <dd>
                  {activeVersion.gateway} · {activeVersion.provider}
                </dd>
              </div>
            </dl>
          </section>

          <PromptPublishForm
            operationKey={operation.operationKey}
            activeVersionId={operation.activeVersionId}
            activeVersion={activeVersion.version}
            activePrompt={activeVersion.promptTemplate}
          />
        </div>
      ) : (
        <div className={styles.unavailablePanel} role="status">
          <strong>Handlingen mangler en aktiv version</strong>
          <p>
            Den kan ikke redigeres her, før en serverstyret startversion er
            oprettet og aktiveret.
          </p>
        </div>
      )}

      <details className={styles.history} open>
        <summary>
          Versionshistorik <span>{operation.versions.length}</span>
        </summary>
        <p className={styles.historyIntro}>
          Versioner kan ikke overskrives eller slettes. Historikken viser
          konfiguration og revisionsoplysninger, mens interne bruger-id’er
          erstattes af neutrale roller.
        </p>
        <ol>
          {operation.versions.map((version) => (
            <li key={version.id}>
              <VersionAudit
                version={version}
                active={version.id === operation.activeVersionId}
              />
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}

export function AiPromptWorkspace({ catalog }: { catalog: AiPromptCatalog }) {
  return (
    <section
      className={styles.workspace}
      id="ai-prompts"
      aria-labelledby="ai-prompts-title"
    >
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.kicker}>AI-konfiguration</p>
          <h2 id="ai-prompts-title">Prompter og versioner</h2>
          <p>
            Gennemgå den aktive prompt, udgiv en ny immutable version og følg
            den fulde historik. Nye AI-handlinger dukker op som separate kort.
          </p>
        </div>
      </header>

      {catalog.kind === "unavailable" ? (
        <div className={styles.unavailablePanel} role="alert">
          <strong>Promptversionerne kan ikke hentes</strong>
          <p>
            Databasen er ikke ændret. Genindlæs siden eller prøv igen senere.
          </p>
        </div>
      ) : catalog.operations.length === 0 ? (
        <div className={styles.unavailablePanel} role="status">
          <strong>Ingen AI-handlinger endnu</strong>
          <p>
            Når en serverstyret handling oprettes, kan dens prompt vedligeholdes
            her.
          </p>
        </div>
      ) : (
        <div className={styles.operationList}>
          {catalog.operations.map((operation) => (
            <OperationWorkspace
              operation={operation}
              key={operation.operationKey}
            />
          ))}
        </div>
      )}
    </section>
  );
}
