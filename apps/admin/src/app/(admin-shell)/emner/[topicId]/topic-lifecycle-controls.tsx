"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  deleteTopicAction,
  publishTopicAction,
  unpublishTopicAction,
} from "./actions";
import styles from "./page.module.css";
import type {
  TopicLifecycleActionState,
  TopicLifecycleOperation,
} from "./topic-lifecycle-state";

const INITIAL_STATE: TopicLifecycleActionState = {
  message: "",
  operation: null,
  status: "idle",
};

type TopicLifecycleControlsProps = {
  expectedUpdatedAt: string;
  hasPublishableDrafts: boolean;
  isPublished: boolean;
  topicId: string;
  topicTitle: string;
};

export function TopicLifecycleControls({
  expectedUpdatedAt,
  hasPublishableDrafts,
  isPublished,
  topicId,
  topicTitle,
}: TopicLifecycleControlsProps) {
  const router = useRouter();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const [dialog, setDialog] = useState<TopicLifecycleOperation | null>(null);
  const [unpublishState, unpublishAction, unpublishPending] = useActionState(
    unpublishTopicAction,
    INITIAL_STATE,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteTopicAction,
    INITIAL_STATE,
  );
  const [publishState, publishAction, publishPending] = useActionState(
    publishTopicAction,
    INITIAL_STATE,
  );
  const activeState =
    dialog === "delete"
      ? deleteState
      : dialog === "publish"
        ? publishState
        : unpublishState;
  const pending =
    dialog === "delete"
      ? deletePending
      : dialog === "publish"
        ? publishPending
        : unpublishPending;

  useEffect(() => {
    if (
      publishState.status !== "success" &&
      unpublishState.status !== "success"
    ) {
      return;
    }

    const refreshTimer = window.setTimeout(() => {
      setDialog(null);
      router.refresh();
    }, 0);

    return () => window.clearTimeout(refreshTimer);
  }, [publishState.status, router, unpublishState.status]);

  useEffect(() => {
    if (!dialog) return;

    cancelButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) setDialog(null);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [dialog, pending]);

  return (
    <>
      {(!isPublished || hasPublishableDrafts) && (
        <button
          className={styles.publishButton}
          type="button"
          aria-haspopup="dialog"
          onClick={() => setDialog("publish")}
        >
          {isPublished ? "Publicér nye kladder" : "Publicér emne"}
        </button>
      )}
      <button
        className={isPublished ? styles.unpublishButton : styles.deleteButton}
        type="button"
        aria-haspopup="dialog"
        onClick={() => setDialog(isPublished ? "unpublish" : "delete")}
      >
        {isPublished ? "Fjern publicering" : "Slet emne"}
      </button>

      {dialog ? (
        <div className={styles.dialogBackdrop} role="presentation">
          <section
            aria-describedby="topic-lifecycle-description"
            aria-labelledby="topic-lifecycle-title"
            aria-modal="true"
            className={styles.lifecycleDialog}
            role="dialog"
          >
            <p className={styles.dialogEyebrow}>
              {dialog === "delete" ? "Permanent handling" : "Publicering"}
            </p>
            <h2 id="topic-lifecycle-title">
              {dialog === "delete"
                ? `Slet ${topicTitle}?`
                : dialog === "publish"
                  ? `Publicér ${topicTitle}?`
                  : `Skjul ${topicTitle} for børnene?`}
            </h2>
            <p id="topic-lifecycle-description">
              {dialog === "delete"
                ? "Emnet, dets mål, deløvelser og garderobeting bliver slettet. Emner med registreret børneaktivitet kan ikke slettes."
                : dialog === "publish"
                  ? "Alle gemte mål og deløvelser bliver synlige for børnene med det samme. Kun godkendte garderobeting bliver publiceret."
                  : "Emnet forsvinder fra børnenes app, men alt indhold bevares og kan redigeres eller publiceres igen senere."}
            </p>

            {activeState.status !== "idle" &&
            activeState.status !== "success" ? (
              <p className={styles.dialogError} role="alert">
                {activeState.message}
              </p>
            ) : null}

            <form
              action={
                dialog === "delete"
                  ? deleteAction
                  : dialog === "publish"
                    ? publishAction
                    : unpublishAction
              }
              className={styles.dialogActions}
            >
              <input type="hidden" name="topicId" value={topicId} />
              <input
                type="hidden"
                name="expectedUpdatedAt"
                value={expectedUpdatedAt}
              />
              <input type="hidden" name="confirmation" value={dialog} />
              <button
                ref={cancelButtonRef}
                className={styles.dialogCancelButton}
                type="button"
                disabled={pending}
                onClick={() => setDialog(null)}
              >
                {dialog === "delete"
                  ? "Behold emnet"
                  : dialog === "publish"
                    ? "Ikke endnu"
                    : "Behold publiceringen"}
              </button>
              <button
                className={
                  dialog === "delete"
                    ? styles.dialogDeleteButton
                    : styles.dialogConfirmButton
                }
                type="submit"
                disabled={pending}
              >
                {pending
                  ? "Arbejder…"
                  : dialog === "delete"
                    ? "Slet emnet permanent"
                    : dialog === "publish"
                      ? "Publicér emnet"
                      : "Fjern publicering"}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
