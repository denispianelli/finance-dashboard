import { useOutletContext } from 'react-router-dom';
import type { AppOutletContext } from '../lib/outletContext';
import { AccountManager } from '../components/accounts/AccountManager';

export function AccountsPage() {
  const { notifyDataChanged } = useOutletContext<AppOutletContext>();
  return <AccountManager onMutated={notifyDataChanged} />;
}
