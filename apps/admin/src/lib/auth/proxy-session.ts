const STATIC_FILE_EXTENSION =
  /\.(?:avif|css|gif|ico|jpe?g|js|json|map|png|svg|webp|woff2?)$/i;

export function shouldRefreshAuthForPath(pathname: string): boolean {
  return (
    pathname.startsWith("/") &&
    !pathname.startsWith("/_next/static/") &&
    !pathname.startsWith("/_next/image/") &&
    pathname !== "/favicon.ico" &&
    !STATIC_FILE_EXTENSION.test(pathname)
  );
}
