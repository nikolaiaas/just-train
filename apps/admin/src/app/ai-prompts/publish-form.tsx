"use client";

import { useActionState, useId, useState } from "react";

import { publishAiPromptVersion } from "./actions";
import {
  initialPublishPromptState,
  MAX_PROMPT_LENGTH,
} from "./prompt-publication";
import styles from "./prompt-workspace.module.css";

type PromptPublishFormProps = {
  operationKey: string;
  activeVersionId: string;
  activeVersion: number;
  activePrompt: string;
};

export function PromptPublishForm({
  operationKey,
  activeVersionId,
  activeVersion,
  activePrompt,
}: PromptPublishFormProps) {
  const fieldId = useId();
  const [state, formAction, pending] = useActionState(
    publishAiPromptVersion,
    initialPublishPromptState,
  );
  const [draftState, setDraftState] = useState({
    activeVersionId,
    prompt: activePrompt,
  });
  const [confirmationState, setConfirmationState] = useState({
    activeVersionId,
    checked: false,
  });
  const draft =
    draftState.activeVersionId === activeVersionId
      ? draftState.prompt
      : activePrompt;
  const confirmed =
    confirmationState.activeVersionId === activeVersionId
      ? confirmationState.checked
      : false;
  const promptError =
    state.status === "invalid" ? state.fieldErrors?.promptTemplate : undefined;
  const confirmationError =
    state.status === "invalid" ? state.fieldErrors?.confirmation : undefined;
  const characterCount = Array.from(draft).length;
  const hasChanges = draft !== activePrompt;
  const messageClassName =
    state.status === "success"
      ? styles.successMessage
      : state.status === "idle"
        ? styles.statusMessageIdle
        : styles.errorMessage;

  return (
    <form action={formAction} className={styles.publishForm}>
      <input type="hidden" name="operationKey" value={operationKey} />
      <input
        type="hidden"
        name="expectedActiveVersionId"
        value={activeVersionId}
      />

      <div className={styles.formHeading}>
        <div>
          <p className={styles.kicker}>Ny immutable version</p>
          <h3>Redigér og udgiv prompten</h3>
        </div>
        <span className={styles.versionPill}>Fra v{activeVersion}</span>
      </div>

      <p className={styles.formIntro}>
        En udgivelse opretter en ny version. Provider, model, kontrakter og
        sikkerhedsgrænser kopieres på serveren og kan ikke vælges her.
      </p>

      <label className={styles.promptField} htmlFor={fieldId}>
        <span>Prompt</span>
        <textarea
          id={fieldId}
          name="promptTemplate"
          required
          maxLength={MAX_PROMPT_LENGTH}
          rows={9}
          value={draft}
          aria-invalid={Boolean(promptError)}
          aria-describedby={`${fieldId}-help${promptError ? ` ${fieldId}-error` : ""}`}
          onChange={(event) =>
            setDraftState({
              activeVersionId,
              prompt: event.target.value,
            })
          }
        />
      </label>
      <div className={styles.fieldMeta} id={`${fieldId}-help`}>
        <span>
          {hasChanges
            ? "Ændringerne bliver først aktive, når du udgiver."
            : "Redigér den aktive prompt for at oprette en ny version."}
        </span>
        <span>
          {characterCount.toLocaleString("da-DK")} /{" "}
          {MAX_PROMPT_LENGTH.toLocaleString("da-DK")}
        </span>
      </div>
      {promptError ? (
        <p className={styles.fieldError} id={`${fieldId}-error`}>
          {promptError}
        </p>
      ) : null}

      <label className={styles.confirmation}>
        <input
          type="checkbox"
          name="confirmation"
          value="reviewed"
          checked={confirmed}
          aria-invalid={Boolean(confirmationError)}
          onChange={(event) =>
            setConfirmationState({
              activeVersionId,
              checked: event.target.checked,
            })
          }
        />
        <span>
          Jeg har gennemgået prompten og forstår, at den bliver aktiv for nye
          AI-job med det samme.
        </span>
      </label>
      {confirmationError ? (
        <p className={styles.fieldError}>{confirmationError}</p>
      ) : null}

      <div className={styles.formFooter}>
        <p
          className={messageClassName}
          role={
            state.status === "success" || state.status === "idle"
              ? "status"
              : "alert"
          }
          aria-live="polite"
        >
          {state.status === "idle"
            ? "Eksisterende job forbliver låst til deres oprindelige version."
            : state.message}
        </p>
        <button
          className={styles.publishButton}
          type="submit"
          disabled={pending || !hasChanges}
        >
          {pending ? "Udgiver…" : "Udgiv ny version"}
        </button>
      </div>
    </form>
  );
}
