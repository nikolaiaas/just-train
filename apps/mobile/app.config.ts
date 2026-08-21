import type { ConfigContext, ExpoConfig } from "expo/config";

type AppVariant = "development" | "preview" | "production";

const variants: Record<
  AppVariant,
  { name: string; bundleIdentifier: string; scheme: string }
> = {
  development: {
    name: "Bare Træn Dev",
    bundleIdentifier: "dk.baretraen.app.dev",
    scheme: "baretraen-dev",
  },
  preview: {
    name: "Bare Træn Preview",
    bundleIdentifier: "dk.baretraen.app.preview",
    scheme: "baretraen-preview",
  },
  production: {
    name: "Bare Træn",
    bundleIdentifier: "dk.baretraen.app",
    scheme: "baretraen",
  },
};

function getVariant(): AppVariant {
  const variant = process.env.APP_VARIANT;

  if (variant === "preview" || variant === "production") {
    return variant;
  }

  return "development";
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const appVariant = getVariant();
  const variant = variants[appVariant];
  const plugins = config.plugins ?? [];

  return {
    ...config,
    name: variant.name,
    slug: config.slug ?? "bare-traen",
    scheme: variant.scheme,
    ios: {
      ...config.ios,
      bundleIdentifier: variant.bundleIdentifier,
    },
    android: {
      ...config.android,
      package: variant.bundleIdentifier,
    },
    plugins: [
      ...plugins,
      [
        "expo-secure-store",
        {
          configureAndroidBackup: true,
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission:
            "Vælg et billede af dit barn for at lave et privat tegneserieportræt i Bare Træn.",
          cameraPermission: false,
          microphonePermission: false,
        },
      ],
    ],
    extra: {
      ...config.extra,
      appVariant,
    },
  };
};
