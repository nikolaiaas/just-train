import { AiMediaError } from "@bare-traen/api-client";

const STALE_PROCESSING_MS = 8 * 60 * 1_000;

export function getAiPollDelay(pollCount: number): number {
  return pollCount < 3 ? 2_000 : 5_000;
}

export function shouldReconcileAiJob(
  input: {
    processingStartedAt: string | null;
    status: string;
  },
  now = Date.now(),
): boolean {
  if (input.status !== "processing" || !input.processingStartedAt) {
    return false;
  }

  const startedAt = Date.parse(input.processingStartedAt);
  return Number.isFinite(startedAt) && now - startedAt >= STALE_PROCESSING_MS;
}

export function getAiMediaErrorMessage(error: unknown): string {
  if (error instanceof AiMediaError) {
    if (error.code === "operation_unavailable") {
      return "AI-billedlabben er ikke åbnet på serveren endnu.";
    }

    if (
      error.code === "family_access_denied" ||
      error.code === "session_changed"
    ) {
      return "Din adgang ændrede sig. Gå tilbage og prøv igen efter nyt login.";
    }

    if (error.code === "invalid_child_profile_id") {
      return "Det valgte barn er ikke tilgængeligt. Gå tilbage, vælg barnet igen, og prøv derefter.";
    }

    if (
      error.code === "input_too_large" ||
      error.code === "invalid_image_bytes"
    ) {
      return "Billedet kunne ikke klargøres sikkert. Vælg et andet billede.";
    }
  }

  return "Tegneseriebilledet kunne ikke laves. Prøv igen senere.";
}

export function getAiJobErrorMessage(code: string | null): string {
  if (code === "provider_rejected_input" || code === "invalid_input_image") {
    return "Billedet blev afvist. Vælg et andet, tydeligt billede af barnet.";
  }

  if (code === "provider_rate_limited" || code === "provider_unavailable") {
    return "Billedtjenesten er midlertidigt optaget. Start en ny test senere.";
  }

  if (code === "provider_outcome_unknown") {
    return "Vi kunne ikke bekræfte resultatet sikkert. Testen blev stoppet uden automatisk genkørsel.";
  }

  return "Tegneseriebilledet kunne ikke færdiggøres.";
}
