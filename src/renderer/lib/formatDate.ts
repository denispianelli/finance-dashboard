import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

/** Format an ISO timestamp as "d MMM yyyy 'à' HH:mm" (French), or "—" when null. */
export function formatTs(iso: string | null): string {
  if (iso === null) return '—';
  return format(new Date(iso), "d MMM yyyy 'à' HH:mm", { locale: fr });
}
