"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const CLEANUP_STATE_KEY = "__bareTraenSkillPackageHistoryCleanup";

type SkillPackageHistoryCleanupProps = {
  canonicalHref: string;
  cleanupId: string;
};

export function SkillPackageHistoryCleanup({
  canonicalHref,
  cleanupId,
}: SkillPackageHistoryCleanupProps) {
  const router = useRouter();
  const handledThisMountRef = useRef(false);

  useEffect(() => {
    if (handledThisMountRef.current) return;
    handledThisMountRef.current = true;

    const currentState =
      typeof window.history.state === "object" && window.history.state !== null
        ? (window.history.state as Record<string, unknown>)
        : {};

    if (currentState[CLEANUP_STATE_KEY] === cleanupId) {
      router.replace(canonicalHref);
      return;
    }

    window.history.replaceState(
      { ...currentState, [CLEANUP_STATE_KEY]: cleanupId },
      "",
      window.location.href,
    );
    router.push(canonicalHref);
  }, [canonicalHref, cleanupId, router]);

  return null;
}
