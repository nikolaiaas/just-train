export function getResendSeconds(
  requestedAt: number | null,
  now: number,
): number {
  if (!requestedAt || !Number.isFinite(now)) {
    return 0;
  }

  return Math.max(0, Math.ceil((requestedAt + 60_000 - now) / 1_000));
}
