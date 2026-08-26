"use server";

import {
  AdminSkillPackageError,
  loadAdminTopicAiJob,
  parseAdminSkillPackageOutput,
  parseAdminSkillSuggestionsOutput,
  prepareAdminTopicAiJob,
  saveAdminSkillPackageDraft,
  type AdminSkillPackageOutput,
  type AdminSkillSuggestionsOutput,
  type AdminTopicAiJob,
  type BareTraenClient,
} from "@bare-traen/api-client";
import { revalidatePath } from "next/cache";

import { getAdminAccessSession } from "@/lib/auth/dal";
import { readCanonicalOriginEnvironment } from "@/lib/auth/environment";
import { resolveTrustedActionOrigin } from "@/lib/auth/origin";
import { getAdminRequestContext } from "@/lib/auth/request-context";
import { assistantInvocationErrorMessage } from "@/app/emner/assistant-invocation";
import {
  attachWardrobeGridImages,
  createWardrobeGridImageInput,
  deriveWardrobeGridImageRequestId,
  parseWardrobeGridImageOutput,
} from "@/app/emner/wardrobe-grid";
import { parseAssistantOutput } from "@/app/emner/assistant-request";
import {
  buildSkillWardrobeMessage,
  deriveSkillStageRequestId,
  type CompleteSkillPackage,
  type SkillDifficulty,
} from "@/app/emner/skill-package";

type SkillActionError = {
  message: string;
  requestRecovery: "retry_same" | "start_new";
  status: "error";
};

export type SuggestSkillsState =
  | { status: "idle" }
  | SkillActionError
  | {
      output: AdminSkillSuggestionsOutput;
      requestId: string;
      status: "success";
    };

export type GenerateSkillPackageState =
  | { status: "idle" }
  | SkillActionError
  | {
      package: CompleteSkillPackage;
      requestId: string;
      status: "success";
    };

export type SaveSkillPackageState =
  | { status: "idle" }
  | SkillActionError
  | {
      exerciseCount: number;
      goalId: string;
      status: "success";
      topicId: string;
      wardrobeCount: number;
    };

type CanonicalTopicContext = {
  description: string;
  existingForPackage: Array<{ slug: string; title: string }>;
  existingForSuggestions: Array<{ summary: string; title: string }>;
  id: string;
  title: string;
};

type SkillSeed = {
  childDescription: string;
  difficulty: SkillDifficulty;
  estimatedMinutes: number | null;
  title: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;

function actionError(
  message: string,
  requestRecovery: SkillActionError["requestRecovery"] = "retry_same",
): SkillActionError {
  return { message, requestRecovery, status: "error" };
}

function readUniqueField(formData: FormData, name: string): string | null {
  const values = formData.getAll(name);
  return values.length === 1 && typeof values[0] === "string"
    ? values[0]
    : null;
}

function readUuid(formData: FormData, name: string): string | null {
  const value = readUniqueField(formData, name)?.toLowerCase() ?? null;
  return value && UUID_PATTERN.test(value) ? value : null;
}

function normalizeMessage(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  return normalized.length > 0 &&
    normalized.length <= 1_000 &&
    !CONTROL_PATTERN.test(normalized)
    ? normalized
    : null;
}

function parseSkillSeed(value: string | null): SkillSeed | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length !== 4 ||
      typeof parsed.title !== "string" ||
      parsed.title !== parsed.title.trim() ||
      parsed.title.length < 1 ||
      parsed.title.length > 120 ||
      typeof parsed.childDescription !== "string" ||
      parsed.childDescription !== parsed.childDescription.trim() ||
      parsed.childDescription.length > 600 ||
      (parsed.difficulty !== "beginner" &&
        parsed.difficulty !== "intermediate" &&
        parsed.difficulty !== "advanced") ||
      (parsed.estimatedMinutes !== null &&
        (!Number.isSafeInteger(parsed.estimatedMinutes) ||
          (parsed.estimatedMinutes as number) < 1 ||
          (parsed.estimatedMinutes as number) > 180))
    ) {
      return null;
    }

    return {
      childDescription: parsed.childDescription,
      difficulty: parsed.difficulty,
      estimatedMinutes: parsed.estimatedMinutes as number | null,
      title: parsed.title,
    };
  } catch {
    return null;
  }
}

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

async function getAuthorizedClient(): Promise<
  { client: BareTraenClient; ok: true } | { error: SkillActionError; ok: false }
> {
  if (!(await requestHasTrustedOrigin())) {
    return {
      error: actionError(
        "Anmodningen kom ikke fra en godkendt administrationsside. Genindlæs siden og prøv igen.",
      ),
      ok: false,
    };
  }

  const session = await getAdminAccessSession();
  if (session.access.kind === "unauthenticated") {
    return {
      error: actionError(
        "Din session er udløbet. Log ind igen, før du fortsætter.",
      ),
      ok: false,
    };
  }
  if (session.access.kind !== "authorized" || !session.client) {
    return {
      error: actionError(
        session.access.kind === "denied"
          ? "Din konto har ikke adgang til at oprette færdigheder."
          : "Administrationen kan ikke forbinde til databasen lige nu.",
      ),
      ok: false,
    };
  }

  return { client: session.client, ok: true };
}

async function loadCanonicalTopic(
  client: BareTraenClient,
  topicId: string,
): Promise<CanonicalTopicContext | null> {
  const [topicResponse, goalsResponse] = await Promise.all([
    client
      .from("topics")
      .select("id, title, description")
      .eq("id", topicId)
      .maybeSingle(),
    client
      .from("goals")
      .select("title, slug, summary")
      .eq("topic_id", topicId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (topicResponse.error || goalsResponse.error || !topicResponse.data) {
    return null;
  }

  return {
    description: topicResponse.data.description,
    existingForPackage: goalsResponse.data.map((goal) => ({
      slug: goal.slug,
      title: goal.title,
    })),
    existingForSuggestions: goalsResponse.data.map((goal) => ({
      summary: goal.summary,
      title: goal.title,
    })),
    id: topicResponse.data.id,
    title: topicResponse.data.title,
  };
}

function mapJobFailure(job: AdminTopicAiJob): SkillActionError {
  const message =
    job.publicErrorCode === "provider_rate_limited"
      ? "AI-leverandøren har travlt. Vent et øjeblik og prøv igen."
      : job.publicErrorCode === "provider_rejected_input"
        ? "AI-leverandøren kunne ikke behandle teksten. Skriv den lidt kortere og prøv igen."
        : job.publicErrorCode === "cost_limit_exceeded"
          ? "Forslaget blev stoppet ved den fastsatte prisgrænse."
          : "AI kunne ikke færdiggøre forslaget. Intet er gemt.";
  return actionError(message, "start_new");
}

async function runPreparedJob(
  client: BareTraenClient,
  prepared: AdminTopicAiJob,
): Promise<AdminTopicAiJob | SkillActionError> {
  if (prepared.status !== "succeeded") {
    const { error } = await client.functions.invoke("process-admin-ai-job", {
      body: { jobId: prepared.jobId },
    });
    if (error) return actionError(assistantInvocationErrorMessage(error));
  }

  const job = await loadAdminTopicAiJob(client, {
    expectedOperationKey: prepared.operationKey,
    jobId: prepared.jobId,
  });
  if (job.status === "failed" || job.status === "cancelled") {
    return mapJobFailure(job);
  }
  if (job.status !== "succeeded") {
    return actionError(
      "AI arbejder stadig. Vent et øjeblik og prøv igen med den samme anmodning.",
    );
  }
  return job;
}

function isActionError(
  value: AdminTopicAiJob | SkillActionError,
): value is SkillActionError {
  return "message" in value;
}

function mapContractError(error: unknown): SkillActionError {
  if (!(error instanceof AdminSkillPackageError)) {
    return actionError(
      "Administrationen kunne ikke gennemføre handlingen lige nu. Intet er gemt.",
    );
  }

  if (error.code === "operation_unavailable") {
    return actionError(
      "Den komplette AI-bygger er ikke installeret i dette datamiljø endnu. Du kan stadig oprette færdigheden manuelt.",
      "start_new",
    );
  }
  if (error.code === "admin_access_denied") {
    return actionError("Din konto har ikke adgang til denne handling.");
  }
  if (error.code === "topic_conflict") {
    return actionError(
      "Emnet blev ændret, mens pakken blev bygget. Genindlæs siden og lav et nyt forslag.",
      "start_new",
    );
  }
  if (error.code === "request_conflict") {
    return actionError(
      "Denne anmodning er allerede brugt til en anden pakke. Start et nyt forslag.",
      "start_new",
    );
  }

  return actionError(
    "AI-pakken kunne ikke valideres sikkert. Intet er gemt.",
    "start_new",
  );
}

export async function suggestAdminSkills(
  _previousState: SuggestSkillsState,
  formData: FormData,
): Promise<SuggestSkillsState> {
  const topicId = readUuid(formData, "topicId");
  const requestId = readUuid(formData, "requestId");
  const message = normalizeMessage(readUniqueField(formData, "message"));
  if (!topicId || !requestId || !message) {
    return actionError("Skriv kort, hvilke færdigheder AI skal lede efter.");
  }

  const access = await getAuthorizedClient();
  if (!access.ok) return access.error;

  try {
    const topic = await loadCanonicalTopic(access.client, topicId);
    if (!topic) return actionError("Emnet kunne ikke hentes.", "start_new");

    const prepared = await prepareAdminTopicAiJob(access.client, {
      clientRequestId: requestId,
      inputData: {
        existingSkills: topic.existingForSuggestions,
        history: [],
        message,
        topic: { description: topic.description, title: topic.title },
      },
      operationKey: "content.skill_suggestions",
      topicId,
    });
    const job = await runPreparedJob(access.client, prepared);
    if (isActionError(job)) return job;

    const output = parseAdminSkillSuggestionsOutput(job.outputData);
    return output
      ? { output, requestId, status: "success" }
      : actionError(
          "AI-forslaget havde et ukendt format og blev derfor ikke vist.",
          "start_new",
        );
  } catch (error) {
    return mapContractError(error);
  }
}

export async function generateAdminSkillPackage(
  _previousState: GenerateSkillPackageState,
  formData: FormData,
): Promise<GenerateSkillPackageState> {
  const topicId = readUuid(formData, "topicId");
  const requestId = readUuid(formData, "requestId");
  const message = normalizeMessage(readUniqueField(formData, "message"));
  const skillSeed = parseSkillSeed(readUniqueField(formData, "skillSeed"));
  if (!topicId || !requestId || !message || !skillSeed) {
    return actionError(
      "Vælg eller beskriv én færdighed, før AI bygger hele pakken.",
    );
  }

  const access = await getAuthorizedClient();
  if (!access.ok) return access.error;

  try {
    const topic = await loadCanonicalTopic(access.client, topicId);
    if (!topic) return actionError("Emnet kunne ikke hentes.", "start_new");

    const skillRequestId = await deriveSkillStageRequestId(
      requestId,
      "skill-package",
    );
    const wardrobePlanRequestId = await deriveSkillStageRequestId(
      requestId,
      "skill-package-wardrobe-plan",
    );

    const preparedSkill = await prepareAdminTopicAiJob(access.client, {
      clientRequestId: skillRequestId,
      inputData: {
        existingSkills: topic.existingForPackage,
        history: [],
        message,
        skillSeed,
        topic: { description: topic.description, title: topic.title },
      },
      operationKey: "content.skill_package",
      topicId,
    });
    const skillJob = await runPreparedJob(access.client, preparedSkill);
    if (isActionError(skillJob)) return skillJob;
    const packageOutput = parseAdminSkillPackageOutput(skillJob.outputData);
    if (!packageOutput) {
      return actionError(
        "Færdighedspakken havde et ukendt format og blev derfor ikke vist.",
        "start_new",
      );
    }

    const wardrobeMessage = buildSkillWardrobeMessage(
      packageOutput as AdminSkillPackageOutput,
    );
    const wardrobeInput = {
      history: [],
      message: wardrobeMessage,
      topic: { description: topic.description, title: topic.title },
    };
    const preparedPlan = await prepareAdminTopicAiJob(access.client, {
      clientRequestId: wardrobePlanRequestId,
      inputData: wardrobeInput,
      operationKey: "content.wardrobe_grid_plan",
      topicId,
    });
    const planJob = await runPreparedJob(access.client, preparedPlan);
    if (isActionError(planJob)) return planJob;
    const parsedPlan = parseAssistantOutput("wardrobe", planJob.outputData);
    if (!parsedPlan || parsedPlan.items.length !== 16) {
      return actionError(
        "Garderobeplanen havde et ukendt format og blev derfor ikke vist.",
        "start_new",
      );
    }

    const imageRequestId = await deriveWardrobeGridImageRequestId(
      wardrobePlanRequestId,
    );
    const preparedImage = await prepareAdminTopicAiJob(access.client, {
      clientRequestId: imageRequestId,
      inputData: createWardrobeGridImageInput(
        wardrobeInput.topic,
        parsedPlan.items,
      ),
      operationKey: "content.wardrobe_grid_image",
      topicId,
    });
    const imageJob = await runPreparedJob(access.client, preparedImage);
    if (isActionError(imageJob)) return imageJob;
    const imageOutput = parseWardrobeGridImageOutput(
      imageJob.outputData,
      imageJob.jobId,
    );
    if (!imageOutput) {
      return actionError(
        "Billedarket havde et ukendt format og blev derfor ikke vist.",
        "start_new",
      );
    }

    const wardrobeItems = attachWardrobeGridImages(
      parsedPlan.items,
      imageOutput,
      (path) =>
        access.client.storage.from("wardrobe-images").getPublicUrl(path).data
          .publicUrl,
    );
    if (!wardrobeItems) {
      return actionError(
        "De 16 billeder kunne ikke forbindes sikkert med forslagene.",
        "start_new",
      );
    }

    return {
      package: {
        imageJobId: imageJob.jobId,
        package: packageOutput as AdminSkillPackageOutput,
        skillJobId: skillJob.jobId,
        wardrobeItems,
        wardrobePlanJobId: planJob.jobId,
      },
      requestId,
      status: "success",
    };
  } catch (error) {
    return mapContractError(error);
  }
}

export async function saveGeneratedAdminSkillPackage(
  _previousState: SaveSkillPackageState,
  formData: FormData,
): Promise<SaveSkillPackageState> {
  const topicId = readUuid(formData, "topicId");
  const clientRequestId = readUuid(formData, "requestId");
  const skillJobId = readUuid(formData, "skillJobId");
  const wardrobePlanJobId = readUuid(formData, "wardrobePlanJobId");
  const wardrobeImageJobId = readUuid(formData, "wardrobeImageJobId");
  const expectedUpdatedAt = readUniqueField(formData, "expectedUpdatedAt");
  const reviewed = readUniqueField(formData, "reviewed") === "yes";

  if (
    !topicId ||
    !clientRequestId ||
    !skillJobId ||
    !wardrobePlanJobId ||
    !wardrobeImageJobId ||
    !expectedUpdatedAt ||
    !reviewed
  ) {
    return actionError(
      "Gennemgå hele pakken og markér den som gennemgået, før du gemmer.",
    );
  }

  const access = await getAuthorizedClient();
  if (!access.ok) return access.error;

  try {
    const result = await saveAdminSkillPackageDraft(access.client, {
      clientRequestId,
      expectedUpdatedAt,
      skillJobId,
      topicId,
      wardrobeImageJobId,
      wardrobePlanJobId,
    });

    revalidatePath("/emner");
    revalidatePath(`/emner/${topicId}`);

    return {
      exerciseCount: result.exerciseIds.length,
      goalId: result.goalId,
      status: "success",
      topicId,
      wardrobeCount: result.wardrobeItemIds.length,
    };
  } catch (error) {
    return mapContractError(error);
  }
}
