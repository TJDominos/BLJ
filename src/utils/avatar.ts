/**
 * Deterministic, offline-safe vector avatar generator.
 * Eliminates external HTTP requests (e.g. dicebear) that violate static content security rules.
 */
export function getAvatarUrl(seed?: string, providedAvatar?: string): string {
  if (providedAvatar && !providedAvatar.startsWith('http://') && !providedAvatar.includes('dicebear.com')) {
    return providedAvatar;
  }

  const s = (seed || 'Player').trim();
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }

  const palettes = [
    { bg: ['#2563EB', '#1D4ED8'], text: '#FFFFFF' },
    { bg: ['#059669', '#047857'], text: '#FFFFFF' },
    { bg: ['#D97706', '#B45309'], text: '#FFFFFF' },
    { bg: ['#7C3AED', '#6D28D9'], text: '#FFFFFF' },
    { bg: ['#DB2777', '#BE185D'], text: '#FFFFFF' },
    { bg: ['#0D9488', '#0F766E'], text: '#FFFFFF' },
    { bg: ['#4F46E5', '#4338CA'], text: '#FFFFFF' },
    { bg: ['#EA580C', '#C2410C'], text: '#FFFFFF' },
  ];

  const palette = palettes[Math.abs(hash) % palettes.length];
  const initial = (s.charAt(0) || 'P').toUpperCase();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><defs><linearGradient id="g_${Math.abs(hash)}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${palette.bg[0]}"/><stop offset="100%" stop-color="${palette.bg[1]}"/></linearGradient></defs><rect width="64" height="64" rx="32" fill="url(#g_${Math.abs(hash)})"/><text x="32" y="40" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="26" font-weight="bold" fill="${palette.text}" text-anchor="middle">${initial}</text></svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
