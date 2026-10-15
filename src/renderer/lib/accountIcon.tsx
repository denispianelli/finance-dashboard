import { CreditCard, Landmark, PiggyBank, Wallet } from 'lucide-react';

// Static icon table (read by reference in render — not created during render).
const ACCOUNT_ICON = {
  savings: PiggyBank,
  card: CreditCard,
  checking: Wallet,
  bank: Landmark,
} as const;

/** Map a (free-form) account type string to a static icon key. Defaults to bank. */
function accountIconKey(type: string): keyof typeof ACCOUNT_ICON {
  const t = type.toLowerCase();
  if (t.includes('saving') || t.includes('livret') || t.includes('epargne')) return 'savings';
  if (t.includes('card') || t.includes('revolv') || t.includes('credit')) return 'card';
  if (t.includes('check') || t.includes('courant') || t.includes('joint')) return 'checking';
  return 'bank';
}

/** Brass-tinted icon tile for an account — shared between AccountManager and
 *  AccountTabs. `size` is the square side in px. */
export function AccountIconTile({ type, size = 36 }: { type: string; size?: number }) {
  const Icon = ACCOUNT_ICON[accountIconKey(type)];
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg bg-brass-soft text-brass"
      style={{ width: size, height: size }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={1.7} />
    </span>
  );
}
