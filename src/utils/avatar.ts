/**
 * Offline-safe avatar resolver.
 * Avoids data: URIs and external network calls.
 */
export function getAvatarUrl(_seed?: string, providedAvatar?: string): string | undefined {
  if (providedAvatar && !providedAvatar.startsWith('http')) {
    return providedAvatar;
  }
  return undefined;
}
