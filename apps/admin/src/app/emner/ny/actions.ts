"use server";

import {
  AdminContentStepError,
  createAdminExerciseDraft as createExerciseDraft,
  createAdminGoalDraft as createGoalDraft,
  createAdminTopicDraft as createTopicDraft,
  createAdminWardrobeItemDraft as createWardrobeItemDraft,
  decideAdminWardrobeItemDraft as decideWardrobeItemDraft,
  updateAdminExerciseDraft as updateExerciseDraft,
  updateAdminGoalDraft as updateGoalDraft,
  updateAdminTopicDraft as updateTopicDraft,
  updateAdminWardrobeItemDraft as updateWardrobeItemDraft,
  type AdminWardrobeItemDraft,
  type BareTraenClient,
} from "@bare-traen/api-client";
import { revalidatePath } from "next/cache";

import { getAdminAccessSession } from "@/lib/auth/dal";
import { readCanonicalOriginEnvironment } from "@/lib/auth/environment";
import { resolveTrustedActionOrigin } from "@/lib/auth/origin";
import { getAdminRequestContext } from "@/lib/auth/request-context";

import {
  parseAssistantOutput,
  validateAssistantRequest,
  type AssistantDraftReview,
  type AssistantSuggestion,
  type AssistantWardrobeItem,
} from "../assistant-request";
import {
  mapExerciseCreationError,
  mapExerciseUpdateError,
  mapGoalCreationError,
  mapGoalUpdateError,
  mapTopicCreationError,
  mapTopicUpdateError,
} from "./creation-error-state";
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
import {
  validateWardrobeDecisionForm,
  validateWardrobeItemDraftForm,
  type WardrobeItemDraftFieldErrors,
} from "../wardrobe-item-draft";

export type {
  AssistantMode,
  AssistantDraftReview,
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
  | {
      status: "success";
      message: string;
      topicId: string;
      updatedAt: string;
    };

export type CreateGoalState =
  | { status: "idle" }
  | {
      status: "invalid";
      message: string;
      fieldErrors: GoalDraftFieldErrors;
    }
  | { status: "denied" | "unavailable"; message: string }
  | {
      status: "success";
      message: string;
      goalId: string;
      updatedAt: string;
    };

export type CreateExerciseState =
  | { status: "idle" }
  | {
      status: "invalid";
      message: string;
      fieldErrors: ExerciseDraftFieldErrors;
    }
  | { status: "denied" | "unavailable"; message: string }
  | {
      status: "success";
      message: string;
      exerciseId: string;
      updatedAt: string;
    };

export type WardrobeItemState =
  | { status: "idle" }
  | {
      status: "invalid";
      message: string;
      fieldErrors: WardrobeItemDraftFieldErrors;
    }
  | { status: "conflict" | "denied" | "unavailable"; message: string }
  | {
      status: "success";
      message: string;
      operation: "created" | "updated" | "approved" | "rejected";
      item: AdminWardrobeItemDraft;
    };

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
      review: AssistantDraftReview | null;
    };

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

function readExpectedUpdatedAt(formData: FormData): string {
  const values = formData.getAll("expectedUpdatedAt");
  return values.length === 1 && typeof values[0] === "string" ? values[0] : "";
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
      updatedAt: result.topic.updatedAt,
    };
  } catch (error) {
    return mapTopicCreationError(error);
  }
}

export async function updateAdminTopicDraft(
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
          message: "Din konto har ikke adgang til at redigere emner.",
        }
      : {
          status: "unavailable",
          message:
            "Administrationen kan ikke forbinde til databasen lige nu. Intet er gemt.",
        };
  }

  try {
    const result = await updateTopicDraft(session.client, {
      authenticatedUserId: session.access.profile.id,
      accentColor: validation.value.accentColor,
      description: validation.value.description,
      expectedUpdatedAt: readExpectedUpdatedAt(formData),
      icon: validation.value.icon,
      requestId: validation.value.requestId,
      slug: validation.value.slug,
      title: validation.value.title,
    });

    revalidatePath("/");
    revalidatePath("/emner/ny");

    return {
      status: "success",
      message: "Emnekladden er opdateret.",
      topicId: result.topic.id,
      updatedAt: result.topic.updatedAt,
    };
  } catch (error) {
    return mapTopicUpdateError(error);
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
      updatedAt: result.goal.updatedAt,
    };
  } catch (error) {
    return mapGoalCreationError(error);
  }
}

export async function updateAdminGoalDraft(
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
          message: "Din konto har ikke adgang til at redigere mål.",
        }
      : {
          status: "unavailable",
          message:
            "Administrationen kan ikke forbinde til databasen lige nu. Intet er gemt.",
        };
  }

  try {
    const result = await updateGoalDraft(session.client, {
      authenticatedUserId: session.access.profile.id,
      difficulty: validation.value.difficulty,
      equipment: validation.value.equipment,
      estimatedMinutes: validation.value.estimatedMinutes,
      expectedUpdatedAt: readExpectedUpdatedAt(formData),
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
      message: "Målkladden er opdateret.",
      goalId: result.goal.id,
      updatedAt: result.goal.updatedAt,
    };
  } catch (error) {
    return mapGoalUpdateError(error);
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
      updatedAt: result.exercise.updatedAt,
    };
  } catch (error) {
    return mapExerciseCreationError(error);
  }
}

export async function updateAdminExerciseDraft(
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
          message: "Din konto har ikke adgang til at redigere deløvelser.",
        }
      : {
          status: "unavailable",
          message:
            "Administrationen kan ikke forbinde til databasen lige nu. Intet er gemt.",
        };
  }

  try {
    const result = await updateExerciseDraft(session.client, {
      authenticatedUserId: session.access.profile.id,
      equipment: validation.value.equipment,
      estimatedMinutes: validation.value.recommendedMinutes,
      expectedUpdatedAt: readExpectedUpdatedAt(formData),
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
      message: "Deløvelseskladden er opdateret.",
      exerciseId: result.exercise.id,
      updatedAt: result.exercise.updatedAt,
    };
  } catch (error) {
    return mapExerciseUpdateError(error);
  }
}

function mapWardrobeActionError(
  error: unknown,
  operation: "create" | "update" | "decision",
): WardrobeItemState {
  if (!(error instanceof AdminContentStepError)) {
    return {
      status: "unavailable",
      message:
        "Garderobetinget kunne ikke gemmes lige nu. Dine indtastninger er bevaret.",
    };
  }

  if (error.code === "admin_access_denied") {
    return {
      status: "denied",
      message: "Din konto har ikke adgang til at ændre garderoben.",
    };
  }

  if (
    error.code === "wardrobe_draft_conflict" ||
    error.code === "wardrobe_draft_not_editable"
  ) {
    return {
      status: "conflict",
      message:
        "Garderobetinget er ændret et andet sted. Dine ændringer er ikke gemt. Genindlæs siden, og prøv igen på den nyeste version.",
    };
  }

  if (error.code === "wardrobe_creation_conflict") {
    return {
      status: "conflict",
      message:
        "Denne garderobekladde kolliderer med en eksisterende gemning. Genindlæs siden, og prøv igen.",
    };
  }

  return {
    status: "unavailable",
    message:
      operation === "decision"
        ? "Godkendelsen kunne ikke gemmes lige nu. Garderobetinget er ikke ændret."
        : operation === "update"
          ? "Ændringerne kunne ikke gemmes lige nu. Dine indtastninger er bevaret."
          : "Garderobetinget kunne ikke gemmes lige nu. Dine indtastninger er bevaret.",
  };
}

async function getWardrobeAdminSession(): Promise<
  | {
      ok: true;
      client: BareTraenClient;
      userId: string;
    }
  | { ok: false; state: WardrobeItemState }
> {
  if (!(await requestHasTrustedOrigin())) {
    return {
      ok: false,
      state: {
        status: "denied",
        message:
          "Gemningen kom ikke fra en godkendt administrationsside. Genindlæs siden og prøv igen.",
      },
    };
  }

  const session = await getAdminAccessSession();

  if (session.access.kind === "unauthenticated") {
    return {
      ok: false,
      state: {
        status: "denied",
        message: "Din session er udløbet. Log ind igen, før du gemmer.",
      },
    };
  }

  if (session.access.kind !== "authorized" || !session.client) {
    return {
      ok: false,
      state:
        session.access.kind === "denied"
          ? {
              status: "denied",
              message: "Din konto har ikke adgang til at ændre garderoben.",
            }
          : {
              status: "unavailable",
              message:
                "Administrationen kan ikke forbinde til databasen lige nu. Intet er gemt.",
            },
    };
  }

  return {
    ok: true,
    client: session.client,
    userId: session.access.profile.id,
  };
}

export async function createAdminWardrobeItemDraft(
  _previousState: WardrobeItemState,
  formData: FormData,
): Promise<WardrobeItemState> {
  const validation = validateWardrobeItemDraftForm(formData);

  if (!validation.ok) {
    return {
      status: "invalid",
      message: validation.message,
      fieldErrors: validation.fieldErrors,
    };
  }

  const session = await getWardrobeAdminSession();
  if (!session.ok) return session.state;

  try {
    const result = await createWardrobeItemDraft(session.client, {
      authenticatedUserId: session.userId,
      category: validation.value.category,
      editorialNote: validation.value.editorialNote,
      icon: validation.value.icon,
      name: validation.value.name,
      points: validation.value.points,
      rarity: validation.value.rarity,
      requestId: validation.value.requestId,
      sortOrder: validation.value.sortOrder,
      topicId: validation.value.topicId,
      unlockRule: validation.value.unlockRule,
    });

    revalidatePath("/");
    revalidatePath("/emner/ny");

    return {
      status: "success",
      message: result.created
        ? "Garderobetinget er gemt som kladde."
        : "Garderobetinget var allerede gemt og er hentet igen.",
      operation: "created",
      item: result.item,
    };
  } catch (error) {
    return mapWardrobeActionError(error, "create");
  }
}

export async function updateAdminWardrobeItemDraft(
  _previousState: WardrobeItemState,
  formData: FormData,
): Promise<WardrobeItemState> {
  const validation = validateWardrobeItemDraftForm(formData);

  if (!validation.ok) {
    return {
      status: "invalid",
      message: validation.message,
      fieldErrors: validation.fieldErrors,
    };
  }

  const session = await getWardrobeAdminSession();
  if (!session.ok) return session.state;

  try {
    const result = await updateWardrobeItemDraft(session.client, {
      authenticatedUserId: session.userId,
      category: validation.value.category,
      editorialNote: validation.value.editorialNote,
      expectedUpdatedAt: readExpectedUpdatedAt(formData),
      icon: validation.value.icon,
      name: validation.value.name,
      points: validation.value.points,
      rarity: validation.value.rarity,
      requestId: validation.value.requestId,
      sortOrder: validation.value.sortOrder,
      topicId: validation.value.topicId,
      unlockRule: validation.value.unlockRule,
    });

    revalidatePath("/");
    revalidatePath("/emner/ny");

    return {
      status: "success",
      message:
        "Garderobetinget er opdateret som kladde og skal godkendes igen.",
      operation: "updated",
      item: result.item,
    };
  } catch (error) {
    return mapWardrobeActionError(error, "update");
  }
}

export async function decideAdminWardrobeItemDraft(
  _previousState: WardrobeItemState,
  formData: FormData,
): Promise<WardrobeItemState> {
  const validation = validateWardrobeDecisionForm(formData);

  if (!validation.ok) {
    return {
      status: "invalid",
      message: validation.message,
      fieldErrors: {},
    };
  }

  const session = await getWardrobeAdminSession();
  if (!session.ok) return session.state;

  try {
    const result = await decideWardrobeItemDraft(session.client, {
      authenticatedUserId: session.userId,
      decision: validation.value.decision,
      expectedUpdatedAt: validation.value.expectedUpdatedAt,
      topicId: validation.value.topicId,
      wardrobeItemId: validation.value.itemId,
    });

    revalidatePath("/");
    revalidatePath("/emner/ny");

    return {
      status: "success",
      message:
        validation.value.decision === "approved"
          ? "Garderobetinget er godkendt til den senere publicering."
          : "Garderobetinget er afvist og bliver ikke taget med i en publicering.",
      operation: validation.value.decision,
      item: result.item,
    };
  } catch (error) {
    return mapWardrobeActionError(error, "decision");
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
    review: parsed.review ?? null,
  };
}
