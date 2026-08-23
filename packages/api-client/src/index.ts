import type { Database } from "@bare-traen/domain";
import {
  createClient,
  type SupabaseClient,
  type SupabaseClientOptions,
} from "@supabase/supabase-js";

export * from "./auth.ts";
export * from "./ai-media.ts";
export * from "./child.ts";
export * from "./content.ts";
export * from "./content-steps.ts";
export * from "./parent.ts";
export * from "./wardrobe.ts";
export * from "./topic-lifecycle.ts";

export type BareTraenClient = SupabaseClient<Database>;

export type PublicSupabaseConfig = {
  url: string;
  publishableKey: string;
};

const MAX_PUBLIC_KEY_LENGTH = 8_192;

function readLegacyJwtRole(value: string): string | null {
  const segments = value.split(".");
  const payload = segments[1];

  if (segments.length !== 3 || !payload || !/^[A-Za-z0-9_-]+$/.test(payload)) {
    return null;
  }

  try {
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const bytes: number[] = [];
    let bits = 0;
    let buffer = 0;

    for (const character of payload) {
      const value = alphabet.indexOf(character);

      if (value < 0) {
        return null;
      }

      buffer = (buffer << 6) | value;
      bits += 6;

      if (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >> bits) & 0xff);
      }
    }

    const decoded = JSON.parse(String.fromCharCode(...bytes)) as {
      role?: unknown;
    };
    return typeof decoded.role === "string" ? decoded.role : null;
  } catch {
    return null;
  }
}

/**
 * Validates values that are intentionally safe to ship in a browser or native
 * bundle. Elevated Supabase keys are rejected before a client is created.
 */
export function parsePublicSupabaseConfig(
  input: Partial<PublicSupabaseConfig>,
): PublicSupabaseConfig {
  const url = input.url?.trim();
  const publishableKey = input.publishableKey?.trim();

  if (!url) {
    throw new Error("Supabase URL is missing.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Supabase URL is invalid.");
  }

  const isExactLocalEndpoint =
    parsedUrl.protocol === "http:" &&
    (parsedUrl.hostname === "127.0.0.1" ||
      parsedUrl.hostname === "localhost") &&
    parsedUrl.port === "54321";
  const isHostedEndpoint =
    parsedUrl.protocol === "https:" && Boolean(parsedUrl.hostname);

  if (
    (!isHostedEndpoint && !isExactLocalEndpoint) ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error(
      "Supabase URL must be a clean HTTPS base URL or the local CLI endpoint.",
    );
  }

  if (!publishableKey) {
    throw new Error("Supabase publishable key is missing.");
  }

  if (publishableKey.length > MAX_PUBLIC_KEY_LENGTH) {
    throw new Error("Supabase publishable key is invalid.");
  }

  const legacyRole = readLegacyJwtRole(publishableKey);

  if (
    publishableKey.startsWith("sb_secret_") ||
    legacyRole === "service_role" ||
    legacyRole === "supabase_admin"
  ) {
    throw new Error("A Supabase secret key cannot be used in a public client.");
  }

  return { url: parsedUrl.toString().replace(/\/$/, ""), publishableKey };
}

export function createBareTraenClient(
  config: PublicSupabaseConfig,
  options?: SupabaseClientOptions<"public">,
): BareTraenClient {
  const parsed = parsePublicSupabaseConfig(config);
  return createClient<Database>(parsed.url, parsed.publishableKey, {
    ...options,
    auth: {
      ...options?.auth,
      autoRefreshToken: true,
      debug: false,
      detectSessionInUrl: false,
      flowType: "pkce",
      persistSession: true,
    },
  });
}
