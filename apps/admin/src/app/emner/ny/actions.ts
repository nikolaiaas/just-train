"use server";

import {
  AdminContentError,
  AdminContentStepError,
  createAdminExerciseDraft as createExerciseDraft,
  createAdminGoalDraft as createGoalDraft,
  createAdminTopicDraft as createTopicDraft,
} from "@bare-traen/api-client";
import { revalidatePath } from "next/cache";

import { getAdminAccessSession } from "@/lib/auth/dal";
import { readCanonicalOriginEnvironment } from "@/lib/auth/environment";
import { resolveTrustedActionOrigin } from "@/lib/auth/origin";
import { getAdminRequestContext } from "@/lib/auth/request-context";

import {
  parseAssistantOutput,
  validateAssistantRequest,
  type AssistantSuggestion,
  type AssistantWardrobeItem,
} from "../assistant-request";
import {
  validateExerciseDraftForm,
  validateGoalDraftForm,
  type ExerciseDraftFieldErrors,
  type GoalDraftFieldErrors,
} from "../content-step-draft";
import {
  validateTopicDraftForm,
  type TopicDraftFieldErrors,
} from "../topic-draft";

export type {
  AssistantMode,
  AssistantSuggestion,
  AssistantWardrobeItem,
  ExerciseAssistantSuggestion,
  GoalAssistantSuggestion,
  TopicAssistantSuggestion,
} from "../assistant-request";

export type CreateTopicState =
  | { status: "idle" }
  | {
      status: "invalid";
      message: string;
      fieldErrors: TopicDraftFieldErrors;
    }
  | { status: "denied" | "unavailable"; message: string }
  | { status: "success"; message: string; topicId: string };

export type CreateGoalState =
  | { status: "idle" }
  | {
      status: "invalid";
      message: string;
      fieldErrors: GoalDraftFieldErrors;
    }
  | { status: "denied" | "unavailable"; message: string }
  | { status: "success"; message: string; goalId: string };

export type CreateExerciseState =
  | { status: "idle" }
  | {
      status: "invalid";
      message: string;
      fieldErrors: ExerciseDraftFieldErrors;
    }
  | { status: "denied" | "unavailable"; message: string }
  | { status: "success"; message: string; exerciseId: string };

export type AssistantState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      requestId: string | null;
      requestRecovery: "retry_same" | "start_new";
    }
  | {
      status: "success";
      requestId: string;
      reply: string;
      suggestion: AssistantSuggestion | null;
      items: AssistantWardrobeItem[];
    };

export const initialCreateTopicState: CreateTopicState = { status: "idle" };
export const initialCreateGoalState: CreateGoalState = { status: "idle" };
export const initialCreateExerciseState: CreateExerciseState = {
  status: "idle",
};
export const initialAssistantState: AssistantState = { status: "idle" };

async function requestHasTrustedOrigin(): Promise<boolean> {
  const requestContext = await getAdminRequestContext();

  return Boolean(
    resolveTrustedActionOrigin({
      originHeader: requestContext.requestHeaders.get("origin"),
      hostHeader: requestContext.requestHeaders.get("host"),
      nodeEnvironment: process.env.NODE_ENV,
      ...readCanonicalOriginEnvironment(),
    }),
  );
}

function mapTopicCreationError(error: unknown): CreateTopicState {
  if (!(error instanceof AdminContentError)) {
    return {
      status: "unavailable",
      message:
        "Emnekladden kunne ikke gemmes lige nu. Intet er publiceret. Prøv igen senere.",
    };
  }

  if (error.code === "admin_access_denied") {
    return {
      status: "denied",
      message: "Din konto har ikke adgang til at oprette emner.",
    };
  }

  if (error.code === "topic_creation_conflict") {
    return {
      status: "invalid",
      message:
        "Denne kladdeanmodning er allerede brugt til et andet emne. Genindlæs siden og prøv igen.",
      fieldErrors: {},
    };
  }

  return {
    status: "unavailable",
    message:
      "Emnekladden kunne ikke gemmes lige nu. Intet er publiceret. Prøv igen senere.",
  };
}

function mapGoalCreationError(error: unknown): CreateGoalState {
  if (!(error instanceof AdminContentStepError)) {
    return {
      status: "unavailable",
      message:
        "Målkladden kunne ikke gemmes lige nu. Intet er publiceret. Prøv igen senere.",
    };
  }

  if (error.code === "admin_access_denied") {
    return {
      status: "denied",
      message: "Din konto har ikke adgang til at oprette mål.",
    };
  }

  if (error.code === "goal_creation_conflict") {
    return {
      status: "invalid",
      message:
        "Denne kladdeanmodning er allerede brugt til et andet mål. Genindlæs siden og prøv igen.",
      fieldErrors: {},
    };
  }

  return {
    status: "unavailable",
    message:
      "Målkladden kunne ikke gemmes lige nu. Intet er publiceret. Prøv igen senere.",
  };
}

function mapExerciseCreationError(error: unknown): CreateExerciseState {
  if (!(error instanceof AdminContentStepError)) {
    return {
      status: "unavailable",
      message:
        "Deløvelseskladden kunne ikke gemmes lige nu. Intet er publiceret. Prøv igen senere.",
    };
  }

  if (error.code === "admin_access_denied") {
    return {
      status: "denied",
      message: "Din konto har ikke adgang til at oprette deløvelser.",
    };
  }

  if (error.code === "exercise_creation_conflict") {
    return {
      status: "invalid",
      message:
        "Denne kladdeanmodning er allerede brugt til en anden deløvelse. Genindlæs siden og prøv igen.",
      fieldErrors: {},
    };
  }

  return {
    status: "unavailable",
    message:
      "Deløvelseskladden kunne ikke gemmes lige nu. Intet er publiceret. Prøv igen senere.",
  };
}

export async function createAdminTopicDraft(
  _previousState: CreateTopicState,
  formData: FormData,
): Promise<CreateTopicState> {
  const validation = validateTopicDraftForm(formData);

  if (!validation.ok) {
    return {
      status: "invalid",
      message: validation.message,
      fieldErrors: validation.fieldErrors,
    };
  }

  if (!(await requestHasTrustedOrigin())) {
    return {
      status: "denied",
      message:
        "Gemningen kom ikke fra en godkendt administrationsside. Genindlæs siden og prøv igen.",
    };
  }

  const session = await getAdminAccessSession();

  if (session.access.kind === "unauthenticated") {
    return {
      status: "denied",
      message: "Din session er udløbet. Log ind igen, før du gemmer.",
    };
  }

  if (session.access.kind !== "authorized" || !session.client) {
    return session.access.kind === "denied"
      ? {
          status: "denied",
          message: "Din konto har ikke adgang til at oprette emner.",
        }
      : {
          status: "unavailable",
          message:
            "Administrationen kan ikke forbinde til databasen lige nu. Intet er gemt.",
        };
  }

  try {
    const result = await createTopicDraft(session.client, {
      authenticatedUserId: session.access.profile.id,
      accentColor: validation.value.accentColor,
      description: validation.value.description,
      icon: validation.value.icon,
      requestId: validation.value.requestId,
      slug: validation.value.slug,
      title: validation.value.title,
    });

    revalidatePath("/");

    return {
      status: "success",
      message: result.created
        ? "Emnekladden er gemt og klar til næste trin."
        : "Emnekladden var allerede gemt og er hentet igen.",
      topicId: result.topic.id,
    };
  } catch (error) {
    return mapTopicCreationError(error);
  }
}

export async function createAdminGoalDraft(
  _previousState: CreateGoalState,
  formData: FormData,
): Promise<CreateGoalState> {
  const validation = validateGoalDraftForm(formData);

  if (!validation.ok) {
    return {
      status: "invalid",
      message: validation.message,
      fieldErrors: validation.fieldErrors,
    };
  }

  if (!(await requestHasTrustedOrigin())) {
    return {
      status: "denied",
      message:
        "Gemningen kom ikke fra en godkendt administrationsside. Genindlæs siden og prøv igen.",
    };
  }

  const session = await getAdminAccessSession();

  if (session.access.kind === "unauthenticated") {
    return {
      status: "denied",
      message: "Din session er udløbet. Log ind igen, før du gemmer.",
    };
  }

  if (session.access.kind !== "authorized" || !session.client) {
    return session.access.kind === "denied"
      ? {
          status: "denied",
          message: "Din konto har ikke adgang til at oprette mål.",
        }
      : {
          status: "unavailable",
          message:
            "Administrationen kan ikke forbinde til databasen lige nu. Intet er gemt.",
        };
  }

  try {
    const result = await createGoalDraft(session.client, {
      authenticatedUserId: session.access.profile.id,
      difficulty: validation.value.difficulty,
      equipment: validation.value.equipment,
      estimatedMinutes: validation.value.estimatedMinutes,
      heroMediaUrl: validation.value.heroMediaUrl,
      requestId: validation.value.requestId,
      slug: validation.value.slug,
      sortOrder: validation.value.sortOrder,
      summary: validation.value.summary,
      title: validation.value.title,
      topicId: validation.value.topicId,
    });

    revalidatePath("/");
    revalidatePath("/emner/ny");

    return {
      status: "success",
      message: result.created
        ? "Målkladden er gemt og klar til næste trin."
        : "Målkladden var allerede gemt og er hentet igen.",
      goalId: result.goal.id,
    };
  } catch (error) {
    return mapGoalCreationError(error);
  }
}

export async function createAdminExerciseDraft(
  _previousState: CreateExerciseState,
  formData: FormData,
): Promise<CreateExerciseState> {
  const validation = validateExerciseDraftForm(formData);

  if (!validation.ok) {
    return {
      status: "invalid",
      message: validation.message,
      fieldErrors: validation.fieldErrors,
    };
  }

  if (!(await requestHasTrustedOrigin())) {
    return {
      status: "denied",
      message:
        "Gemningen kom ikke fra en godkendt administrationsside. Genindlæs siden og prøv igen.",
    };
  }

  const session = await getAdminAccessSession();

  if (session.access.kind === "unauthenticated") {
    return {
      status: "denied",
      message: "Din session er udløbet. Log ind igen, før du gemmer.",
    };
  }

  if (session.access.kind !== "authorized" || !session.client) {
    return session.access.kind === "denied"
      ? {
          status: "denied",
          message: "Din konto har ikke adgang til at oprette deløvelser.",
        }
      : {
          status: "unavailable",
          message:
            "Administrationen kan ikke forbinde til databasen lige nu. Intet er gemt.",
        };
  }

  try {
    const result = await createExerciseDraft(session.client, {
      authenticatedUserId: session.access.profile.id,
      equipment: validation.value.equipment,
      estimatedMinutes: validation.value.recommendedMinutes,
      goalId: validation.value.goalId,
      instructions: validation.value.instructions,
      measurement: validation.value.measurement,
      requestId: validation.value.requestId,
      safetyNotes: validation.value.safetyNote,
      slug: validation.value.slug,
      sortOrder: validation.value.sortOrder,
      targetValue: validation.value.targetValue,
      title: validation.value.title,
      videoUrl: validation.value.videoUrl,
    });

    revalidatePath("/");
    revalidatePath("/emner/ny");

    return {
      status: "success",
      message: result.created
        ? "Deløvelseskladden er gemt og klar til næste trin."
        : "Deløvelseskladden var allerede gemt og er hentet igen.",
      exerciseId: result.exercise.id,
    };
  } catch (error) {
    return mapExerciseCreationError(error);
  }
}

function assistantError(
  message: string,
  requestId: string | null,
  requestRecovery: "retry_same" | "start_new" = "retry_same",
): AssistantState {
  return { status: "error", message, requestId, requestRecovery };
}

function mapAiJobError(
  publicErrorCode: string | null,
  requestId: string,
): AssistantState {
  const message =
    publicErrorCode === "provider_rate_limited"
      ? "AI-leverandøren har travlt. Vent et øjeblik og prøv igen."
      : publicErrorCode === "provider_rejected_input"
        ? "AI-leverandøren kunne ikke behandle teksten. Omskriv den kort og prøv igen."
        : publicErrorCode === "cost_limit_exceeded"
          ? "Forslaget overskred den fastsatte prisgrænse og blev stoppet."
          : "AI-assistenten kunne ikke lave et forslag lige nu. Din kladde er ikke ændret.";

  return assistantError(message, requestId, "start_new");
}

export async function askAdminContentAssistant(
  _previousState: AssistantState,
  formData: FormData,
): Promise<AssistantState> {
  const validation = validateAssistantRequest(formData);

  if (!validation.ok) {
    return assistantError(validation.message, null);
  }

  const { inputData, mode, operationKey, requestId } = validation.value;

  if (!(await requestHasTrustedOrigin())) {
    return assistantError(
      "AI-anmodningen kom ikke fra en godkendt administrationsside. Genindlæs siden og prøv igen.",
      requestId,
    );
  }

  const session = await getAdminAccessSession();

  if (session.access.kind === "unauthenticated") {
    return assistantError(
      "Din session er udløbet. Log ind igen for at bruge AI-assistenten.",
      requestId,
    );
  }

  if (session.access.kind !== "authorized" || !session.client) {
    return assistantError(
      session.access.kind === "denied"
        ? "Din konto har ikke adgang til AI-assistenten."
        : "AI-assistenten kan ikke forbinde til databasen lige nu.",
      requestId,
    );
  }

  const { data: preparedRows, error: prepareError } = await session.client.rpc(
    "prepare_admin_ai_job",
    {
      p_operation_key: operationKey,
      p_client_request_id: requestId,
      p_input_data: inputData,
    },
  );
  const prepared = preparedRows?.[0];

  if (prepareError || !prepared?.job_id) {
    return assistantError(
      "AI-assistenten er ikke tilgængelig endnu. Din kladde er ikke ændret.",
      requestId,
    );
  }

  if (prepared.job_status !== "succeeded") {
    const { error: invokeError } = await session.client.functions.invoke(
      "process-admin-ai-job",
      { body: { jobId: prepared.job_id } },
    );

    if (invokeError) {
      return assistantError(
        "AI-assistenten kunne ikke startes lige nu. Din kladde er ikke ændret.",
        requestId,
      );
    }
  }

  const { data: job, error: jobError } = await session.client
    .from("ai_jobs")
    .select("status, output_data, public_error_code")
    .eq("id", prepared.job_id)
    .maybeSingle();

  if (jobError || !job) {
    return assistantError(
      "AI-resultatet kunne ikke hentes. Din kladde er ikke ændret.",
      requestId,
    );
  }

  if (job.status === "failed" || job.status === "cancelled") {
    return mapAiJobError(job.public_error_code, requestId);
  }

  if (job.status !== "succeeded") {
    return assistantError(
      "AI-forslaget er ikke færdigt endnu. Vent et øjeblik og prøv igen.",
      requestId,
    );
  }

  const parsed = parseAssistantOutput(mode, job.output_data);

  if (!parsed) {
    return assistantError(
      "AI-resultatet havde et ukendt format og blev derfor ikke vist eller anvendt.",
      requestId,
      "start_new",
    );
  }

  return {
    status: "success",
    requestId,
    reply: parsed.reply,
    suggestion: parsed.suggestion,
    items: parsed.items,
  };
}
