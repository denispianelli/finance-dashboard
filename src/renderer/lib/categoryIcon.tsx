import {
  ArrowDownToLine,
  ArrowLeftRight,
  Briefcase,
  Car,
  Film,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  Plane,
  Plug,
  ShoppingBag,
  ShoppingCart,
  Tv,
  Undo2,
  Utensils,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  incoming: ArrowDownToLine,
  shop: ShoppingCart,
  car: Car,
  home: House,
  utensils: Utensils,
  wallet: Wallet,
  tv: Tv,
  plug: Plug,
  plane: Plane,
  health: HeartPulse,
  education: GraduationCap,
  shopping: ShoppingBag,
  leisure: Film,
  work: Briefcase,
  bank: Landmark,
  transfer: ArrowLeftRight,
  refund: Undo2,
};

export function CategoryIcon({ name }: { name: string }) {
  const Icon = MAP[name] ?? Wallet;
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-line-3 text-paper-soft">
      <Icon size={12} strokeWidth={1.6} />
    </span>
  );
}

/** Icon tile tinted with the category colour — for the Catégories cards and the
 *  dashboard recent-transactions rows. `size` is the square side in px. */
export function CategoryIconTile({
  name,
  color,
  size = 36,
}: {
  name: string;
  color: string | null;
  size?: number;
}) {
  const Icon = MAP[name] ?? Wallet;
  const tint = color ?? '#6E6E78';
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg"
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${tint} 16%, transparent)`,
        color: tint,
      }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={1.7} />
    </span>
  );
}
