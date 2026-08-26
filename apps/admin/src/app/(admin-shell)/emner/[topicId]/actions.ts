"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  AdminTopicLifecycleError,
  deleteAdminTopic,
  publishAdminTopic,
  unpublishAdminTopic,
} from "@bare-traen/api-client";

import { getAdminAccessSession } from "@/lib/auth/dal";
import { readCanonicalOriginEnvironment } from "@/lib/auth/environment";
import { resolveTrustedActionOrigin } from "@/lib/auth/origin";
import { getAdminRequestContext } from "@/lib/auth/request-context";

import type {
  TopicLifecycleActionState,
  TopicLifecycleOperation,
} from "./topic-lifecycle-state";

function uniqueString(formData: FormData, name: string): string | null {
  const values = formData.getAll(name);
  return values.length === 1 && typeof values[0] === "string"
    ? values[0]
    : null;
}

function lifecycleErrorMessage(error: unknown): string {
  if (!(error instanceof AdminTopicLifecycleError)) {
    return "Handlingen kunne ikke gennemføres lige nu. Emnet er ikke ændret.";
  }

  switch (error.code) {
    case "admin_access_denied":
      return "Din konto har ikke adgang til at ændre emnets publicering.";
    case "topic_conflict":
      return "Emnet er blevet ændret et andet sted. Genindlæs siden, og prøv igen.";
    case "topic_in_use":
      return "Emnet har allerede aktivitet fra et barn. Det kan skjules, men ikke slettes.";
    case "topic_must_be_unpublished":
      return "Fjern publiceringen, før emnet slettes.";
    case "topic_not_found":
      return "Emnet findes ikke længere.";
    case "topic_not_ready":
      return "Hver færdighed skal have mindst én øvelse, før emnet publiceres.";
    case "invalid_expected_updated_at":
    case "invalid_topic_id":
      return "Emnet kunne ikke genkendes. Genindlæs siden, og prøv igen.";
    default:
      return "Handlingen kunne ikke gennemføres lige nu. Emnet er ikke ændret.";
  }
}

async function runTopicLifecycleAction(
  operation: TopicLifecycleOperation,
  formData: FormData,
): Promise<TopicLifecycleActionState> {
  const topicId = uniqueString(formData, "topicId");
  const expectedUpdatedAt = uniqueString(formData, "expectedUpdatedAt");
  const confirmation = uniqueString(formData, "confirmation");

  if (!topicId || !expectedUpdatedAt || confirmation !== operation) {
    return {
      message: "Bekræft handlingen igen. Emnet og dets indhold er ikke ændret.",
      operation,
      status: "invalid",
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
      message:
        "Handlingen kom ikke fra en godkendt administrationsside. Genindlæs siden, og prøv igen.",
      operation,
      status: "denied",
    };
  }

  const session = await getAdminAccessSession();

  if (session.access.kind === "unauthenticated") {
    return {
      message: "Din session er udløbet. Log ind igen, før du fortsætter.",
      operation,
      status: "denied",
    };
  }

  if (session.access.kind !== "authorized" || !session.client) {
    return {
      message:
        session.access.kind === "denied"
          ? "Din konto har ikke administratoradgang."
          : "Administrationen kan ikke forbinde til databasen lige nu. Emnet er ikke ændret.",
      operation,
      status: session.access.kind === "denied" ? "denied" : "unavailable",
    };
  }

  try {
    if (operation === "publish") {
      await publishAdminTopic(session.client, {
        expectedUpdatedAt,
        topicId,
      });
    } else if (operation === "unpublish") {
      await unpublishAdminTopic(session.client, {
        expectedUpdatedAt,
        topicId,
      });
    } else {
      await deleteAdminTopic(session.client, { expectedUpdatedAt, topicId });
    }
  } catch (error) {
    return {
      message: lifecycleErrorMessage(error),
      operation,
      status: "unavailable",
    };
  }

  revalidatePath("/emner");
  revalidatePath(`/emner/${topicId}`);

  if (operation === "delete") {
    redirect("/emner?deleted=1");
  }

  return {
    message:
      operation === "publish"
        ? "Emnet og alle gemte færdigheder og øvelser er nu synlige for børnene."
        : operation === "unpublish"
          ? "Emnet er nu skjult for børnene og kan stadig redigeres."
          : "Emnet og alt dets redaktionelle indhold er slettet.",
    operation,
    status: "success",
  };
}

export async function publishTopicAction(
  _previousState: TopicLifecycleActionState,
  formData: FormData,
): Promise<TopicLifecycleActionState> {
  return runTopicLifecycleAction("publish", formData);
}

export async function unpublishTopicAction(
  _previousState: TopicLifecycleActionState,
  formData: FormData,
): Promise<TopicLifecycleActionState> {
  return runTopicLifecycleAction("unpublish", formData);
}

export async function deleteTopicAction(
  _previousState: TopicLifecycleActionState,
  formData: FormData,
): Promise<TopicLifecycleActionState> {
  return runTopicLifecycleAction("delete", formData);
}
