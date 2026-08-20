"use client";

import { useActionState, useEffect, useState } from "react";

import {
  requestAdminLoginCode,
  switchAdminBackend,
  verifyAdminLoginCode,
} from "./actions";
import { initialRequestCodeState, initialVerifyCodeState } from "./login-state";
import { getResendSeconds } from "./login-timing";
import styles from "./page.module.css";

type LoginFormProps = {
  backend: "local" | "development";
  configurationAvailable: boolean;
  localAvailable: boolean;
  reasonMessage: string | null;
  selectorVisible: boolean;
};

function MailIcon() {
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
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4.5 7 7.5 6 7.5-6" />
    </svg>
  );
}

export function LoginForm({
  backend,
  configurationAvailable,
  localAvailable,
  reasonMessage,
  selectorVisible,
}: LoginFormProps) {
  const [requestState, requestAction, requestPending] = useActionState(
    requestAdminLoginCode,
    initialRequestCodeState,
  );
  const [verifyState, verifyAction, verifyPending] = useActionState(
    verifyAdminLoginCode,
    initialVerifyCodeState,
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!requestState.requestedAt) {
      return;
    }

    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [requestState.requestedAt]);

  const resendSeconds = getResendSeconds(requestState.requestedAt, now);
  const codeRequested = requestState.status === "sent";

  return (
    <>
      {reasonMessage ? (
        <p className={styles.notice} role="status">
          {reasonMessage}
        </p>
      ) : null}

      {!configurationAvailable ? (
        <div className={styles.errorNotice} role="alert">
          Loginmiljøet mangler offentlig Supabase-konfiguration. En udvikler
          skal færdiggøre opsætningen.
        </div>
      ) : null}

      {!codeRequested ? (
        <form action={requestAction} className={styles.form} noValidate>
          <label className={styles.field} htmlFor="admin-email">
            <span>Mailadresse</span>
            <span className={styles.inputWrap}>
              <MailIcon />
              <input
                id="admin-email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                maxLength={254}
                required
                disabled={!configurationAvailable || requestPending}
                defaultValue={requestState.email}
                aria-describedby="email-help request-message"
              />
            </span>
          </label>
          <p className={styles.fieldHelp} id="email-help">
            Brug den mailadresse, som har fået administratoradgang.
          </p>
          <p
            className={styles.formMessage}
            id="request-message"
            aria-live="polite"
          >
            {requestState.message}
          </p>
          <button
            className={styles.primaryButton}
            type="submit"
            disabled={!configurationAvailable || requestPending}
          >
            {requestPending ? "Sender…" : "Send loginmail"}
          </button>
        </form>
      ) : (
        <div className={styles.codeStep}>
          <div className={styles.sentMessage} role="status">
            <strong>Tjek din indbakke</strong>
            <p>{requestState.message}</p>
          </div>

          <form action={verifyAction} className={styles.form}>
            <input type="hidden" name="email" value={requestState.email} />
            <label className={styles.field} htmlFor="admin-code">
              <span>Sekscifret kode</span>
              <input
                className={styles.codeInput}
                id="admin-code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,11}"
                maxLength={11}
                required
                autoFocus
                disabled={verifyPending || requestPending}
                aria-describedby="verify-message"
              />
            </label>
            <p
              className={styles.formMessage}
              id="verify-message"
              aria-live="polite"
            >
              {verifyState.message}
            </p>
            <button
              className={styles.primaryButton}
              type="submit"
              disabled={verifyPending || requestPending}
            >
              {verifyPending ? "Logger ind…" : "Log ind med kode"}
            </button>
          </form>

          <div className={styles.secondaryActions}>
            <form action={requestAction}>
              <input type="hidden" name="email" value={requestState.email} />
              <button
                className={styles.textButton}
                type="submit"
                disabled={requestPending || verifyPending || resendSeconds > 0}
              >
                {resendSeconds > 0
                  ? "Send igen om " + resendSeconds + " sek."
                  : requestPending
                    ? "Sender…"
                    : "Send en ny mail"}
              </button>
            </form>
            <a className={styles.textLink} href="/login">
              Brug en anden mailadresse
            </a>
          </div>
        </div>
      )}

      <p className={styles.magicLinkHelp}>
        Du kan også åbne det sikre loginlink i mailen. Du skal aldrig oprette en
        adgangskode.
      </p>

      {selectorVisible ? (
        <details className={styles.backendSelector}>
          <summary>Udviklingsmiljø</summary>
          <div>
            <p>
              Aktiv backend:{" "}
              <strong>
                {backend === "local" ? "Lokal Supabase" : "Hosted Development"}
              </strong>
            </p>
            <form action={switchAdminBackend}>
              <button
                type="submit"
                name="backend"
                value="development"
                aria-pressed={backend === "development"}
              >
                Hosted Development
              </button>
              <button
                type="submit"
                name="backend"
                value="local"
                disabled={!localAvailable}
                aria-pressed={backend === "local"}
                title={
                  localAvailable
                    ? undefined
                    : "Lokal Supabase er ikke konfigureret for administrationen"
                }
              >
                Lokal{localAvailable ? "" : " · ikke tilgængelig"}
              </button>
            </form>
            <small>
              Skift genindlæser login. Sessionerne forbliver adskilt og bliver
              ikke flyttet mellem miljøerne.
            </small>
          </div>
        </details>
      ) : null}
    </>
  );
}
