import {
  handleConfirmationPost,
  isLocalDevelopmentHost,
} from "../confirmation-url";
import { resolveExternalRequestLocation } from "@/lib/auth/request-location";

export async function POST(request: Request): Promise<Response> {
  const externalLocation = resolveExternalRequestLocation({
    requestUrl: request.url,
    hostHeader: request.headers.get("host"),
    forwardedProtocol: request.headers.get("x-forwarded-proto"),
    isVercel: process.env.VERCEL === "1",
  });

  return handleConfirmationPost(request, {
    configuredSupabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    allowLocalSupabase: isLocalDevelopmentHost(
      externalLocation?.host ?? null,
      process.env.NODE_ENV,
    ),
    isVercel: process.env.VERCEL === "1",
  });
}
