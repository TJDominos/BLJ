/**
 * Avatar URL resolver that normalizes and validates HTTP(S), relative, or data:image URLs.
 */
export function getAvatarUrl(_seed?: string, providedAvatar?: string | null): string | undefined {
  if (!providedAvatar || typeof providedAvatar !== 'string') {
    return undefined;
  }
  const trimmed = providedAvatar.trim();
  if (!trimmed) {
    return undefined;
  }
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('data:image/')
  ) {
    return trimmed;
  }
  return undefined;
}

