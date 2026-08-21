"use server";

import { revalidatePath } from "next/cache";

import { getAdminAccessSession } from "@/lib/auth/dal";
import { readCanonicalOriginEnvironment } from "@/lib/auth/environment";
import { resolveTrustedActionOrigin } from "@/lib/auth/origin";
import { getAdminRequestContext } from "@/lib/auth/request-context";

import {
  mapPromptPublicationError,
  type PublishPromptState,
  validatePromptPublication,
} from "./prompt-publication";

function uniqueFormValue(
  formData: FormData,
  name: string,
): FormDataEntryValue | null {
  const values = formData.getAll(name);
  return values.length === 1 ? values[0] : null;
}

export async function publishAiPromptVersion(
  _previousState: PublishPromptState,
  formData: FormData,
): Promise<PublishPromptState> {
  const validation = validatePromptPublication({
    operationKey: uniqueFormValue(formData, "operationKey"),
    promptTemplate: uniqueFormValue(formData, "promptTemplate"),
    expectedActiveVersionId: uniqueFormValue(
      formData,
      "expectedActiveVersionId",
    ),
    confirmation: uniqueFormValue(formData, "confirmation"),
  });

  if (!validation.ok) {
    return {
      status: "invalid",
      message: validation.message,
      fieldErrors: validation.fieldErrors,
    };
  }

  const requestContext = await getAdminRequestContext();
  const trustedOrigin = resolveTrustedActionOrigin({
    originHeader: requestContext.requestHeaders.get("origin"),
    hostHeader: requestContext.requestHeaders.get("host"),
    nodeEnvironment: process.env.NODE_ENV,
    ...readCanonicalOriginEnvironment(),
  });

  if (!trustedOrigin) {
    return {
      status: "denied",
      message:
        "Udgivelsen kom ikke fra en godkendt administrationsside. Genindlæs siden og prøv igen.",
    };
  }

  const session = await getAdminAccessSession();

  if (session.access.kind === "unauthenticated") {
    return {
      status: "denied",
      message: "Din session er udløbet. Log ind igen, før du udgiver.",
    };
  }

  if (session.access.kind !== "authorized" || !session.client) {
    return session.access.kind === "denied"
      ? {
          status: "denied",
          message:
            "Din konto har ikke administratoradgang og kan ikke udgive promptversioner.",
        }
      : {
          status: "unavailable",
          message:
            "Administrationen kan ikke forbinde til databasen lige nu. Den aktive version er ikke ændret.",
        };
  }

  const { data: operation, error: operationError } = await session.client
    .from("ai_operations")
    .select("active_version_id")
    .eq("operation_key", validation.value.operationKey)
    .maybeSingle();

  if (operationError || !operation?.active_version_id) {
    return {
      status: "unavailable",
      message:
        "AI-handlingen eller dens aktive version kan ikke læses lige nu. Genindlæs siden.",
    };
  }

  if (
    operation.active_version_id !== validation.value.expectedActiveVersionId
  ) {
    return mapPromptPublicationError({ code: "40001" });
  }

  const { data: activeVersion, error: activeVersionError } =
    await session.client
      .from("ai_operation_versions")
      .select("prompt_template")
      .eq("id", operation.active_version_id)
      .maybeSingle();

  if (activeVersionError || !activeVersion) {
    return {
      status: "unavailable",
      message:
        "Den aktive prompt kan ikke læses lige nu. Genindlæs siden, før du prøver igen.",
    };
  }

  if (activeVersion.prompt_template === validation.value.promptTemplate) {
    return {
      status: "invalid",
      message: "Prompten er ikke ændret.",
      fieldErrors: {
        promptTemplate:
          "Redigér den aktive prompt, før du udgiver en ny version.",
      },
    };
  }

  const { data, error } = await session.client.rpc(
    "publish_ai_operation_version",
    {
      p_operation_key: validation.value.operationKey,
      p_prompt_template: validation.value.promptTemplate,
      p_expected_active_version_id: validation.value.expectedActiveVersionId,
    },
  );

  if (error) {
    return mapPromptPublicationError(error);
  }

  const publishedVersion = data?.[0]?.version;

  if (!Number.isInteger(publishedVersion) || publishedVersion < 1) {
    return {
      status: "unavailable",
      message:
        "Databasen bekræftede ikke den nye version. Genindlæs siden, før du prøver igen.",
    };
  }

  revalidatePath("/");

  return {
    status: "success",
    message: `Version ${publishedVersion} er udgivet og er nu aktiv. Eksisterende AI-job beholder deres oprindelige version.`,
    publishedVersion,
  };
}
