function readHttpStatus(value: unknown): number | null {
  if (typeof value !== "object" || value === null || !("status" in value)) {
    return null;
  }

  const status = Number((value as { status?: unknown }).status);

  return Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : null;
}

export function readAssistantInvocationStatus(error: unknown): number | null {
  const directStatus = readHttpStatus(error);

  if (directStatus !== null) return directStatus;

  if (typeof error !== "object" || error === null || !("context" in error)) {
    return null;
  }

  return readHttpStatus((error as { context?: unknown }).context);
}

export function assistantInvocationErrorMessage(error: unknown): string {
  switch (readAssistantInvocationStatus(error)) {
    case 401:
    case 403:
      return "Din session blev ikke godkendt af AI-assistenten. Log ind igen, og prøv derefter på ny.";
    case 404:
      return "AI-anmodningen kunne ikke findes. Genindlæs siden og prøv igen.";
    case 429:
      return "AI-assistenten har travlt. Vent et øjeblik og prøv igen.";
    case 503:
      return "AI-assistentens serveropsætning er ikke klar endnu. Din kladde er ikke ændret.";
    default:
      return "AI-assistenten kunne ikke startes lige nu. Din kladde er ikke ændret.";
  }
}
