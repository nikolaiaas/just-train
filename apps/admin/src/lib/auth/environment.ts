import "server-only";

import type { AdminBackendEnvironment } from "./backend";

export function readAdminBackendEnvironment(): AdminBackendEnvironment {
  return {
    developmentUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    developmentPublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    localUrl: process.env.SUPABASE_LOCAL_URL,
    localPublishableKey: process.env.SUPABASE_LOCAL_PUBLISHABLE_KEY,
  };
}

export function readCanonicalOriginEnvironment(): {
  configuredOrigin?: string;
  vercelProjectProductionUrl?: string;
} {
  return {
    configuredOrigin: process.env.ADMIN_PUBLIC_ORIGIN,
    vercelProjectProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  };
}
