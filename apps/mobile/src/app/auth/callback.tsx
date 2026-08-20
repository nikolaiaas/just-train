import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";

import { useAuth } from "@/auth/auth-provider";
import { LoadingAuthScreen } from "@/components/auth-state";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const linkingUrl = Linking.useLinkingURL();
  const { completeMagicLink } = useAuth();
  const started = useRef(false);

  useEffect(() => {
    if (!linkingUrl || started.current) {
      return;
    }

    started.current = true;
    void completeMagicLink(linkingUrl)
      .then(() => router.replace("/"))
      .catch(() => router.replace("/login"));
  }, [completeMagicLink, linkingUrl, router]);

  return <LoadingAuthScreen message="Kontrollerer dit sikre loginlink…" />;
}
