export const MAX_PROMPT_LENGTH = 12_000;

const OPERATION_KEY_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DISALLOWED_CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

export type PromptPublicationInput = {
  operationKey: string;
  promptTemplate: string;
  expectedActiveVersionId: string;
};

export type PromptPublicationFieldErrors = {
  promptTemplate?: string;
  confirmation?: string;
};

export type PromptPublicationValidation =
  | { ok: true; value: PromptPublicationInput }
  | {
      ok: false;
      fieldErrors: PromptPublicationFieldErrors;
      message: string;
    };

export type PublishPromptState =
  | { status: "idle"; message: null }
  | {
      status: "invalid" | "conflict" | "denied" | "unavailable";
      message: string;
      fieldErrors?: PromptPublicationFieldErrors;
    }
  | {
      status: "success";
      message: string;
      publishedVersion: number;
    };

export const initialPublishPromptState: PublishPromptState = {
  status: "idle",
  message: null,
};

export function validatePromptPublication(input: {
  operationKey: unknown;
  promptTemplate: unknown;
  expectedActiveVersionId: unknown;
  confirmation: unknown;
}): PromptPublicationValidation {
  if (
    typeof input.operationKey !== "string" ||
    !OPERATION_KEY_PATTERN.test(input.operationKey) ||
    typeof input.expectedActiveVersionId !== "string" ||
    !UUID_PATTERN.test(input.expectedActiveVersionId)
  ) {
    return {
      ok: false,
      fieldErrors: {},
      message:
        "Promptversionen kan ikke identificeres. Genindlæs siden og prøv igen.",
    };
  }

  if (typeof input.promptTemplate !== "string") {
    return {
      ok: false,
      fieldErrors: { promptTemplate: "Skriv den prompt, der skal udgives." },
      message: "Prompten kunne ikke valideres.",
    };
  }

  const characterCount = Array.from(input.promptTemplate).length;

  if (
    characterCount === 0 ||
    input.promptTemplate !== input.promptTemplate.trim() ||
    DISALLOWED_CONTROL_CHARACTER_PATTERN.test(input.promptTemplate)
  ) {
    return {
      ok: false,
      fieldErrors: {
        promptTemplate:
          "Prompten skal indeholde tekst uden blanke linjer eller mellemrum i begyndelsen og slutningen.",
      },
      message: "Ret prompten, før den udgives.",
    };
  }

  if (characterCount > MAX_PROMPT_LENGTH) {
    return {
      ok: false,
      fieldErrors: {
        promptTemplate: `Prompten må højst være ${MAX_PROMPT_LENGTH.toLocaleString("da-DK")} tegn.`,
      },
      message: "Prompten er for lang.",
    };
  }

  if (input.confirmation !== "reviewed") {
    return {
      ok: false,
      fieldErrors: {
        confirmation: "Bekræft, at prompten er gennemgået, før du udgiver den.",
      },
      message: "Udgivelsen mangler en bekræftelse.",
    };
  }

  return {
    ok: true,
    value: {
      operationKey: input.operationKey,
      promptTemplate: input.promptTemplate,
      expectedActiveVersionId: input.expectedActiveVersionId,
    },
  };
}

export function mapPromptPublicationError(error: {
  code?: string | null;
}): Exclude<PublishPromptState, { status: "idle" | "success" }> {
  switch (error.code) {
    case "40001":
      return {
        status: "conflict",
        message:
          "En anden administrator har udgivet en nyere version. Genindlæs siden, gennemgå den nye aktive prompt og prøv igen.",
      };
    case "42501":
      return {
        status: "denied",
        message:
          "Din session har ikke længere administratoradgang. Log ind igen, før du udgiver.",
      };
    case "22023":
      return {
        status: "invalid",
        message: "Prompten blev afvist af databasen. Ret den og prøv igen.",
      };
    case "P0002":
      return {
        status: "unavailable",
        message:
          "AI-handlingen findes ikke længere eller mangler en aktiv version. Genindlæs siden.",
      };
    default:
      return {
        status: "unavailable",
        message:
          "Prompten kunne ikke udgives lige nu. Den aktive version er ikke ændret.",
      };
  }
}
