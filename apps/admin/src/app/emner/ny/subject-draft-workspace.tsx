"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { buildSubjectDetailHref } from "../subject-routes";
import {
  askAdminContentAssistant,
  createAdminTopicDraft,
  type AssistantState,
  type TopicAssistantSuggestion,
  type CreateTopicState,
} from "./actions";
import styles from "./page.module.css";
import { buildSubjectAssistantContext } from "./subject-create-ux";
import { assistantResponseBelongsToContext } from "./workspace-ux";

type SubjectDraftWorkspaceProps = {
  assistantRequestId: string;
  profileName: string;
  topicRequestId: string;
};

type ChatMessage = {
  content: string;
  id: string;
  role: "assistant" | "user";
};

const INITIAL_TOPIC_STATE: CreateTopicState = { status: "idle" };
const INITIAL_ASSISTANT_STATE: AssistantState = { status: "idle" };

function AppMark() {
  return (
    <span className={styles.appMark} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="m12 2.75 2.57 5.2 5.74.84-4.15 4.04.98 5.72L12 15.84l-5.14 2.71.98-5.72-4.15-4.04 5.74-.84L12 2.75Z" />
      </svg>
    </span>
  );
}

function SparkleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3 1.05 3.3A5.8 5.8 0 0 0 16.7 10L20 11l-3.3 1.05A5.8 5.8 0 0 0 13 15.7L12 19l-1.05-3.3A5.8 5.8 0 0 0 7.3 12L4 11l3.3-1.05A5.8 5.8 0 0 0 11 6.3L12 3Z" />
    </svg>
  );
}

export function SubjectDraftWorkspace({
  assistantRequestId,
  profileName,
  topicRequestId,
}: SubjectDraftWorkspaceProps) {
  const router = useRouter();
  const [topicState, topicAction, topicPending] = useActionState(
    createAdminTopicDraft,
    INITIAL_TOPIC_STATE,
  );
  const [assistantState, assistantAction, assistantPending] = useActionState(
    askAdminContentAssistant,
    INITIAL_ASSISTANT_STATE,
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("✨");
  const [accentColor, setAccentColor] = useState("#53C987");
  const [assistantMessage, setAssistantMessage] = useState("");
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [nextAssistantRequestId, setNextAssistantRequestId] =
    useState(assistantRequestId);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      content:
        "Jeg kan hjælpe med et børnevenligt navn, en kort beskrivelse, et ikon og en farve. Intet bliver gemt, før du selv trykker Gem emne.",
      id: "subject-assistant-welcome",
      role: "assistant",
    },
  ]);
  const [suggestion, setSuggestion] = useState<TopicAssistantSuggestion | null>(
    null,
  );
  const handledTopicId = useRef<string | null>(null);
  const handledAssistantState = useRef<AssistantState>(INITIAL_ASSISTANT_STATE);
  const submittedAssistantMessage = useRef<{
    message: string;
    requestId: string;
  } | null>(null);

  const topicErrors =
    topicState.status === "invalid" ? topicState.fieldErrors : {};
  const serializedHistory = useMemo(
    () =>
      JSON.stringify(
        messages.slice(-6).map(({ content, role }) => ({ content, role })),
      ),
    [messages],
  );
  const serializedContext = useMemo(
    () =>
      JSON.stringify(
        buildSubjectAssistantContext({
          accentColor,
          description,
          icon,
          title,
        }),
      ),
    [accentColor, description, icon, title],
  );

  useEffect(() => {
    if (
      topicState.status !== "success" ||
      topicState.topicId === handledTopicId.current
    ) {
      return;
    }

    handledTopicId.current = topicState.topicId;
    router.replace(buildSubjectDetailHref(topicState.topicId));
  }, [router, topicState]);

  useEffect(() => {
    if (
      assistantState.status === "idle" ||
      assistantState === handledAssistantState.current
    ) {
      return;
    }

    handledAssistantState.current = assistantState;
    const response = assistantState;
    const submitted = submittedAssistantMessage.current;
    const timer = window.setTimeout(() => {
      if (response.status === "error" && !response.requestId) {
        setAssistantError(response.message);
        return;
      }

      if (
        !assistantResponseBelongsToContext({
          currentRequestId: nextAssistantRequestId,
          responseRequestId: response.requestId,
          submittedRequestId: submitted?.requestId ?? null,
        })
      ) {
        return;
      }

      if (response.status === "error") {
        setAssistantError(response.message);
        if (response.requestRecovery === "start_new") {
          submittedAssistantMessage.current = null;
          setNextAssistantRequestId(window.crypto.randomUUID());
        }
        return;
      }

      if (!submitted) return;

      submittedAssistantMessage.current = null;
      setAssistantMessage("");
      setAssistantError(null);
      setMessages((current) => [
        ...current,
        {
          content: submitted.message,
          id: `${response.requestId}-user`,
          role: "user",
        },
        {
          content: response.reply,
          id: `${response.requestId}-assistant`,
          role: "assistant",
        },
      ]);
      setSuggestion(
        response.suggestion?.kind === "topic" ? response.suggestion : null,
      );
      setNextAssistantRequestId(window.crypto.randomUUID());
    }, 0);

    return () => window.clearTimeout(timer);
  }, [assistantState, nextAssistantRequestId]);

  function handleAssistantSubmit() {
    const message = assistantMessage.trim();
    if (!message || assistantPending) return;

    submittedAssistantMessage.current = {
      message,
      requestId: nextAssistantRequestId,
    };
    setAssistantError(null);
    setSuggestion(null);
  }

  function applySuggestion() {
    if (!suggestion?.ready) return;

    setTitle(suggestion.title);
    setDescription(suggestion.description);
    setIcon(suggestion.icon || "✨");
    setAccentColor(suggestion.accentColor || "#53C987");
    setSuggestion(null);
  }

  const topicSaved = topicState.status === "success";

  return (
    <main className={styles.viewport}>
      <div className={styles.appShell}>
        <header className={styles.topbar}>
          <div className={styles.brand}>
            <AppMark />
            <span>Bare Træn</span>
            <span className={styles.brandDivider} aria-hidden="true" />
            <span>Administration</span>
          </div>
          <div className={styles.topbarActions}>
            <span className={styles.draftStatus}>
              <span aria-hidden="true" />
              Nyt emne
            </span>
            <span className={styles.profileName}>{profileName}</span>
          </div>
        </header>

        <div className={styles.pageBody}>
          <header className={styles.pageToolbar}>
            <div>
              <p className={styles.eyebrow}>Indholdsbibliotek</p>
              <h1>Opret et emne</h1>
              <p>
                Start med emnets navn og den tekst, barnet skal se. Når emnet er
                gemt, kan du tilføje færdigheder eller få AI til at foreslå dem.
              </p>
            </div>
            <Link className={styles.secondaryButton} href="/emner">
              Tilbage til emner
            </Link>
          </header>

          <div className={styles.subjectWorkspace}>
            <section
              className={styles.draftPanel}
              aria-labelledby="subject-draft-title"
            >
              <header className={styles.panelHeader}>
                <div>
                  <span
                    className={styles.topicPreview}
                    style={{ backgroundColor: accentColor }}
                    aria-hidden="true"
                  >
                    {icon || "✨"}
                  </span>
                  <div>
                    <p className={styles.eyebrow}>Emnets grundlag</p>
                    <h2 id="subject-draft-title">
                      {title.trim() || "Nyt emne"}
                    </h2>
                  </div>
                </div>
                <span className={styles.reviewBadge}>Kladde</span>
              </header>

              {suggestion ? (
                <aside
                  className={`${styles.suggestionCard} ${styles.subjectSuggestion}`}
                  aria-label="Forslag fra AI-assistenten"
                >
                  <div className={styles.suggestionBody}>
                    <div className={styles.suggestionHeading}>
                      <span aria-hidden="true">✦</span>
                      <strong>
                        {suggestion.ready
                          ? "AI-forslag klar"
                          : "AI har brug for lidt mere information"}
                      </strong>
                    </div>
                    <p>
                      <strong>{suggestion.title || "Emne uden navn"}</strong>
                      {suggestion.description
                        ? ` · ${suggestion.description}`
                        : ""}
                    </p>
                    <p className={styles.suggestionReason}>
                      <strong>Hvorfor:</strong> {suggestion.reason}
                    </p>
                  </div>
                  {suggestion.ready ? (
                    <button type="button" onClick={applySuggestion}>
                      Brug forslaget
                    </button>
                  ) : null}
                </aside>
              ) : null}

              <form
                action={topicAction}
                className={styles.draftForm}
                noValidate
                aria-busy={topicPending || topicSaved}
              >
                <input type="hidden" name="requestId" value={topicRequestId} />
                <div className={styles.fieldGrid}>
                  <label className={styles.iconField}>
                    <span>Ikon</span>
                    <input
                      name="icon"
                      maxLength={16}
                      value={icon}
                      disabled={topicPending || topicSaved}
                      aria-invalid={Boolean(topicErrors.icon)}
                      onChange={(event) => setIcon(event.target.value)}
                    />
                    {topicErrors.icon ? (
                      <small>{topicErrors.icon}</small>
                    ) : null}
                  </label>

                  <label className={styles.titleField}>
                    <span>Navn på emnet</span>
                    <input
                      autoFocus
                      name="title"
                      maxLength={100}
                      required
                      value={title}
                      disabled={topicPending || topicSaved}
                      aria-invalid={Boolean(topicErrors.title)}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Fx Fodbold eller Tegneeventyr"
                    />
                    {topicErrors.title ? (
                      <small>{topicErrors.title}</small>
                    ) : null}
                  </label>

                  <label className={styles.descriptionField}>
                    <span>Beskrivelse barnet ser</span>
                    <textarea
                      name="description"
                      rows={5}
                      maxLength={500}
                      value={description}
                      disabled={topicPending || topicSaved}
                      aria-invalid={Boolean(topicErrors.description)}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Fx: Leg med bolden, lær nye tricks og find din egen stil."
                    />
                    <span className={styles.fieldMeta}>
                      <span>
                        {topicErrors.description ??
                          "Skriv direkte til barnet med du og din."}
                      </span>
                      <span>{Array.from(description).length} / 500</span>
                    </span>
                  </label>

                  <label className={styles.colorField}>
                    <span>Emnefarve</span>
                    <span>
                      <input
                        name="accentColor"
                        type="color"
                        value={accentColor}
                        disabled={topicPending || topicSaved}
                        aria-invalid={Boolean(topicErrors.accentColor)}
                        onChange={(event) => setAccentColor(event.target.value)}
                      />
                      <code>{accentColor.toUpperCase()}</code>
                    </span>
                    {topicErrors.accentColor ? (
                      <small>{topicErrors.accentColor}</small>
                    ) : null}
                  </label>
                </div>

                <footer className={styles.draftFooter}>
                  <p
                    className={
                      topicSaved
                        ? styles.successMessage
                        : topicState.status === "idle"
                          ? styles.idleMessage
                          : styles.errorMessage
                    }
                    aria-live="polite"
                  >
                    {topicSaved
                      ? "Emnet er gemt. Åbner emneoversigten…"
                      : topicState.status === "idle"
                        ? "Emnet gemmes som kladde. Du behøver ikke oprette en færdighed nu."
                        : topicState.message}
                  </p>
                  <button
                    className={styles.primaryButton}
                    type="submit"
                    disabled={topicPending || topicSaved}
                  >
                    {topicPending
                      ? "Gemmer…"
                      : topicSaved
                        ? "Emnet er gemt"
                        : "Gem emne"}
                  </button>
                </footer>
              </form>
            </section>

            <aside
              className={`${styles.assistantPanel} ${styles.subjectAssistant}`}
            >
              <details>
                <summary className={styles.subjectAssistantSummary}>
                  <span className={styles.aiMark}>
                    <SparkleIcon />
                  </span>
                  <span>
                    <strong>Få hjælp af AI</strong>
                    <small>Valgfrit · du vælger selv forslaget</small>
                  </span>
                  <span
                    className={styles.subjectAssistantChevron}
                    aria-hidden="true"
                  >
                    ⌄
                  </span>
                </summary>

                <div
                  className={`${styles.chat} ${styles.subjectAssistantChat}`}
                  role="log"
                  aria-live="polite"
                  aria-label="Samtale med AI-assistenten om emnet"
                >
                  {messages.map((message) => (
                    <p
                      className={
                        message.role === "user"
                          ? styles.userMessage
                          : styles.assistantMessage
                      }
                      key={message.id}
                    >
                      {message.content}
                    </p>
                  ))}
                  {assistantPending ? (
                    <p className={styles.thinkingMessage} role="status">
                      <span aria-hidden="true">✦</span> Udarbejder et forslag…
                    </p>
                  ) : null}
                </div>

                <form
                  action={assistantAction}
                  className={styles.chatForm}
                  onSubmit={handleAssistantSubmit}
                >
                  <input type="hidden" name="mode" value="topic" />
                  <input
                    type="hidden"
                    name="requestId"
                    value={nextAssistantRequestId}
                  />
                  <input
                    type="hidden"
                    name="history"
                    value={serializedHistory}
                  />
                  <input
                    type="hidden"
                    name="context"
                    value={serializedContext}
                  />
                  <label>
                    <span className={styles.visuallyHidden}>Besked til AI</span>
                    <textarea
                      name="message"
                      rows={2}
                      maxLength={1000}
                      required
                      value={assistantMessage}
                      disabled={assistantPending || topicSaved}
                      onChange={(event) =>
                        setAssistantMessage(event.target.value)
                      }
                      placeholder="Fx: Lav et emne om fodbold for et barn, der vil lære tricks"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={
                      assistantPending || topicSaved || !assistantMessage.trim()
                    }
                    aria-label="Send besked til AI"
                  >
                    Send
                  </button>
                </form>
                {assistantError ? (
                  <p className={styles.assistantError} role="alert">
                    {assistantError}
                  </p>
                ) : null}
              </details>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}
