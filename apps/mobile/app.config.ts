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
  const variant = variants[getVariant()];

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
  };
};
