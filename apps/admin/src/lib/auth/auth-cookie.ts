export function isCurrentAuthCookie(
  cookieName: string,
  storageKey: string,
): boolean {
  return (
    cookieName === storageKey ||
    cookieName.startsWith(storageKey + ".") ||
    cookieName.startsWith(storageKey + "-")
  );
}
