import {
  AdminContentError,
  AdminContentStepError,
} from "@bare-traen/api-client";

import type {
  ExerciseDraftFieldErrors,
  GoalDraftFieldErrors,
} from "../content-step-draft";
import type { TopicDraftFieldErrors } from "../topic-draft";

type TopicFailureState =
  | {
      status: "invalid";
      message: string;
      fieldErrors: TopicDraftFieldErrors;
    }
  | { status: "denied" | "unavailable"; message: string };

type GoalFailureState =
  | {
      status: "invalid";
      message: string;
      fieldErrors: GoalDraftFieldErrors;
    }
  | { status: "denied" | "unavailable"; message: string };

type ExerciseFailureState =
  | {
      status: "invalid";
      message: string;
      fieldErrors: ExerciseDraftFieldErrors;
    }
  | { status: "denied" | "unavailable"; message: string };

const DUPLICATE_TOPIC_MESSAGE =
  "Et emne med dette eller et meget lignende navn findes allerede. Vælg et andet navn.";
const DUPLICATE_GOAL_MESSAGE =
  "Et mål med dette eller et meget lignende navn findes allerede under emnet. Vælg et andet navn.";
const DUPLICATE_EXERCISE_MESSAGE =
  "En deløvelse med dette eller et meget lignende navn findes allerede under målet. Vælg et andet navn.";

export function mapTopicCreationError(error: unknown): TopicFailureState {
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

  if (error.code === "topic_slug_conflict") {
    return {
      status: "invalid",
      message: DUPLICATE_TOPIC_MESSAGE,
      fieldErrors: { title: DUPLICATE_TOPIC_MESSAGE },
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

export function mapTopicUpdateError(error: unknown): TopicFailureState {
  if (!(error instanceof AdminContentError)) {
    return {
      status: "unavailable",
      message:
        "Emnet kunne ikke opdateres lige nu. Intet er gemt. Prøv igen senere.",
    };
  }

  if (error.code === "admin_access_denied") {
    return {
      status: "denied",
      message: "Din konto har ikke adgang til at redigere emner.",
    };
  }

  if (error.code === "topic_slug_conflict") {
    return {
      status: "invalid",
      message: DUPLICATE_TOPIC_MESSAGE,
      fieldErrors: { title: DUPLICATE_TOPIC_MESSAGE },
    };
  }

  if (error.code === "topic_draft_not_editable") {
    return {
      status: "unavailable",
      message:
        "Emnet kan ikke længere redigeres. Det kan være fjernet eller have ændret status. Genindlæs siden.",
    };
  }

  if (error.code === "topic_draft_conflict") {
    return {
      status: "unavailable",
      message:
        "Emnet er ændret et andet sted. Dine ændringer er ikke gemt. Genindlæs siden, og prøv igen på den nyeste version.",
    };
  }

  return {
    status: "unavailable",
    message:
      "Emnet kunne ikke opdateres lige nu. Intet er gemt. Prøv igen senere.",
  };
}

export function mapGoalCreationError(error: unknown): GoalFailureState {
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

  if (error.code === "goal_slug_conflict") {
    return {
      status: "invalid",
      message: DUPLICATE_GOAL_MESSAGE,
      fieldErrors: { title: DUPLICATE_GOAL_MESSAGE },
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

export function mapGoalUpdateError(error: unknown): GoalFailureState {
  if (!(error instanceof AdminContentStepError)) {
    return {
      status: "unavailable",
      message:
        "Målet kunne ikke opdateres lige nu. Intet er gemt. Prøv igen senere.",
    };
  }

  if (error.code === "admin_access_denied") {
    return {
      status: "denied",
      message: "Din konto har ikke adgang til at redigere mål.",
    };
  }

  if (error.code === "goal_slug_conflict") {
    return {
      status: "invalid",
      message: DUPLICATE_GOAL_MESSAGE,
      fieldErrors: { title: DUPLICATE_GOAL_MESSAGE },
    };
  }

  if (error.code === "goal_draft_not_editable") {
    return {
      status: "unavailable",
      message:
        "Målet kan ikke længere redigeres. Det kan være fjernet eller have ændret status. Genindlæs siden.",
    };
  }

  if (error.code === "goal_draft_conflict") {
    return {
      status: "unavailable",
      message:
        "Målet er ændret et andet sted. Dine ændringer er ikke gemt. Genindlæs siden, og prøv igen på den nyeste version.",
    };
  }

  return {
    status: "unavailable",
    message:
      "Målet kunne ikke opdateres lige nu. Intet er gemt. Prøv igen senere.",
  };
}

export function mapExerciseCreationError(error: unknown): ExerciseFailureState {
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

  if (error.code === "exercise_slug_conflict") {
    return {
      status: "invalid",
      message: DUPLICATE_EXERCISE_MESSAGE,
      fieldErrors: { title: DUPLICATE_EXERCISE_MESSAGE },
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

export function mapExerciseUpdateError(error: unknown): ExerciseFailureState {
  if (!(error instanceof AdminContentStepError)) {
    return {
      status: "unavailable",
      message:
        "Deløvelsen kunne ikke opdateres lige nu. Intet er gemt. Prøv igen senere.",
    };
  }

  if (error.code === "admin_access_denied") {
    return {
      status: "denied",
      message: "Din konto har ikke adgang til at redigere deløvelser.",
    };
  }

  if (error.code === "exercise_slug_conflict") {
    return {
      status: "invalid",
      message: DUPLICATE_EXERCISE_MESSAGE,
      fieldErrors: { title: DUPLICATE_EXERCISE_MESSAGE },
    };
  }

  if (error.code === "exercise_draft_not_editable") {
    return {
      status: "unavailable",
      message:
        "Deløvelsen kan ikke længere redigeres. Den kan være fjernet eller have ændret status. Genindlæs siden.",
    };
  }

  if (error.code === "exercise_draft_conflict") {
    return {
      status: "unavailable",
      message:
        "Deløvelsen er ændret et andet sted. Dine ændringer er ikke gemt. Genindlæs siden, og prøv igen på den nyeste version.",
    };
  }

  return {
    status: "unavailable",
    message:
      "Deløvelsen kunne ikke opdateres lige nu. Intet er gemt. Prøv igen senere.",
  };
}
