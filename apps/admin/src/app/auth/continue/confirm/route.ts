import {
  handleConfirmationPost,
  isLocalDevelopmentHost,
} from "../confirmation-url";

export async function POST(request: Request): Promise<Response> {
  return handleConfirmationPost(request, {
    configuredSupabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    allowLocalSupabase: isLocalDevelopmentHost(
      new URL(request.url).host,
      process.env.NODE_ENV,
    ),
  });
}
