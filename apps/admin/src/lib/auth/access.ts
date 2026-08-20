export type AdminProfile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
};

export type AdminAccessDecision =
  | { kind: "authorized"; profile: AdminProfile }
  | { kind: "denied" }
  | { kind: "unauthenticated" }
  | { kind: "unavailable" };

export function decideAdminAccess(input: {
  userId: string | null;
  profile: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    is_admin: boolean;
  } | null;
  profileQueryFailed: boolean;
}): AdminAccessDecision {
  if (!input.userId) {
    return { kind: "unauthenticated" };
  }

  if (input.profileQueryFailed) {
    return { kind: "unavailable" };
  }

  if (
    !input.profile ||
    input.profile.id !== input.userId ||
    !input.profile.is_admin
  ) {
    return { kind: "denied" };
  }

  return {
    kind: "authorized",
    profile: {
      id: input.profile.id,
      displayName: input.profile.display_name,
      avatarUrl: input.profile.avatar_url,
      isAdmin: true,
    },
  };
}
