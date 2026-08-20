export type SessionIdentityState = {
  bootstrapRequestId: number;
  userId: string | null;
};

export type SessionIdentityTransition = SessionIdentityState & {
  userChanged: boolean;
};

export function shouldApplyAuthSessionEvent(input: {
  event: string;
  restorePending: boolean;
}): boolean {
  return !(input.restorePending && input.event === "INITIAL_SESSION");
}

export function transitionSessionIdentity(
  current: SessionIdentityState,
  nextUserId: string | null,
): SessionIdentityTransition {
  const userChanged = current.userId !== nextUserId;

  return {
    bootstrapRequestId: userChanged
      ? current.bootstrapRequestId + 1
      : current.bootstrapRequestId,
    userChanged,
    userId: nextUserId,
  };
}

export function canAcceptBootstrapResult(input: {
  activeRequestId: number;
  currentUserId: string | null;
  profileId: string;
  requestId: number;
  requestedUserId: string;
}): boolean {
  return (
    input.requestId === input.activeRequestId &&
    input.currentUserId === input.requestedUserId &&
    input.profileId === input.requestedUserId
  );
}

export function isCurrentBootstrapRequest(input: {
  activeRequestId: number;
  currentUserId: string | null;
  requestId: number;
  requestedUserId: string;
}): boolean {
  return (
    input.requestId === input.activeRequestId &&
    input.currentUserId === input.requestedUserId
  );
}
