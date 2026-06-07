/** Pourcentage entier reçu/total (0 si total inconnu). */
export function modelPercent(s: { receivedBytes?: number; totalBytes?: number }): number {
  if (!s.totalBytes) return 0;
  return Math.round(((s.receivedBytes ?? 0) / s.totalBytes) * 100);
}

/** Taille lisible FR : « 890 Mo » sous 1 Go, « 1,9 Go » au-delà. */
export function formatModelSize(bytes: number): string {
  const go = bytes / 1e9;
  if (go >= 1) {
    return (
      go.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' Go'
    );
  }
  return String(Math.round(bytes / 1e6)) + ' Mo';
}
