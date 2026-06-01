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
};

export function CategoryIcon({ name }: { name: string }) {
  const Icon = MAP[name] ?? Wallet;
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-line-3 text-paper-soft">
      <Icon size={12} strokeWidth={1.6} />
    </span>
  );
}
