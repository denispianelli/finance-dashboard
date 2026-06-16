import { AccountCard } from '@renderer/components/accounts/AccountCard';

export interface Account {
  id: string;
  name: string;
  bank: string;
  balance: string; // pre-formatted or "—" — kept for HeroBalanceTile / AccountsMiniTile
  balanceValue: number | null; // numeric value for AccountCard
  type: string;
}

export function AccountTabs({
  accounts,
  activeId,
  onSelect,
}: {
  accounts: Account[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-4">
      {accounts.map((a) => (
        <AccountCard
          key={a.id}
          type={a.type}
          name={a.name}
          balance={a.balanceValue}
          bank={a.bank}
          active={a.id === activeId}
          onSelect={() => {
            onSelect(a.id);
          }}
        />
      ))}
    </div>
  );
}
