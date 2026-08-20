import type { Database } from "@bare-traen/domain";
import {
  createClient,
  type SupabaseClient,
  type SupabaseClientOptions,
} from "@supabase/supabase-js";

export type BareTraenClient = SupabaseClient<Database>;

export type PublicSupabaseConfig = {
  url: string;
  publishableKey: string;
};

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

  if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "127.0.0.1") {
    throw new Error("Supabase URL must use HTTPS outside local development.");
  }

  if (!publishableKey) {
    throw new Error("Supabase publishable key is missing.");
  }

  if (publishableKey.startsWith("sb_secret_")) {
    throw new Error("A Supabase secret key cannot be used in a public client.");
  }

  return { url: parsedUrl.toString().replace(/\/$/, ""), publishableKey };
}

export function createBareTraenClient(
  config: PublicSupabaseConfig,
  options?: SupabaseClientOptions<"public">,
): BareTraenClient {
  const parsed = parsePublicSupabaseConfig(config);
  return createClient<Database>(parsed.url, parsed.publishableKey, options);
}
