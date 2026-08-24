import { colors } from "@bare-traen/design";
import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import {
  AppState,
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { loadPrivateWebPng, revokePrivateWebImage } from "@/ai/private-output";
import { useAuth } from "@/auth/auth-provider";
import type { ParentChild } from "@/auth/parent-data";
import { resolveChildAvatar } from "@/children/child-setup";

type LoadedAvatar = {
  mediaAssetId: string;
  uri: string;
};

export function ChildProfileAvatar({
  child,
  decorative = false,
  size = 112,
  style,
}: {
  child: ParentChild;
  decorative?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { loadChildProfileAvatar } = useAuth();
  const preset = resolveChildAvatar(child.avatarSeed);
  const [loaded, setLoaded] = useState<LoadedAvatar | null>(null);
  const [refreshRevision, setRefreshRevision] = useState(0);

  useEffect(() => {
    if (Platform.OS === "web" || !child.avatarMediaAssetId) {
      return;
    }

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        setRefreshRevision((revision) => revision + 1);
      }
    });

    return () => subscription.remove();
  }, [child.avatarMediaAssetId]);

  useEffect(() => {
    const expectedAssetId = child.avatarMediaAssetId;

    if (!expectedAssetId) {
      return;
    }

    const controller = new AbortController();
    let active = true;
    let ownedBlobUrl: string | null = null;

    void loadChildProfileAvatar(child.id)
      .then(async (avatar) => {
        if (!avatar || avatar.mediaAssetId !== expectedAssetId) {
          throw new Error("profile_avatar_changed");
        }

        const uri =
          Platform.OS === "web"
            ? await loadPrivateWebPng(avatar.signedUrl, controller.signal)
            : avatar.signedUrl;

        if (Platform.OS === "web") {
          ownedBlobUrl = uri;
        }

        if (!active) {
          revokePrivateWebImage(ownedBlobUrl);
          ownedBlobUrl = null;
          return;
        }

        setLoaded({ mediaAssetId: expectedAssetId, uri });
      })
      .catch(() => {
        if (active && !controller.signal.aborted) {
          setLoaded(null);
        }
      });

    return () => {
      active = false;
      controller.abort();
      revokePrivateWebImage(ownedBlobUrl);
    };
  }, [
    child.avatarMediaAssetId,
    child.id,
    loadChildProfileAvatar,
    refreshRevision,
  ]);

  const imageSource = useMemo(
    () =>
      loaded?.mediaAssetId === child.avatarMediaAssetId
        ? { uri: loaded.uri }
        : undefined,
    [child.avatarMediaAssetId, loaded],
  );
  const label = imageSource
    ? `Profilbillede af ${child.displayName}`
    : `${child.displayName}s valgte avatar: ${preset.label}`;

  return (
    <View
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : label}
      accessibilityRole={decorative ? undefined : "image"}
      style={[
        styles.frame,
        { borderRadius: size / 2, height: size, width: size },
        style,
      ]}
    >
      {imageSource ? (
        <Image
          cachePolicy="none"
          contentFit="cover"
          onError={() => setLoaded(null)}
          source={imageSource}
          style={[styles.image, { borderRadius: size / 2 }]}
        />
      ) : (
        <Text style={{ fontSize: size * 0.52 }}>{preset.symbol}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 3,
    borderColor: colors.yellow,
    backgroundColor: colors.softWarm,
  },
  image: { width: "100%", height: "100%" },
});
