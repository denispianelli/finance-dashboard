import type { Account } from './AccountTabs';
import type { TxRow } from './TxTable';

// Mock data — NOT wired to DB/IPC. Real data is Phase 2 (see issue #69 scope).

export const MOCK_ACCOUNTS: Account[] = [
  { id: 'joint', name: 'Compte joint', bank: 'Boursorama', balance: '3 240,00' },
  { id: 'perso', name: 'Compte courant', bank: 'LCL', balance: '1 487,32' },
  { id: 'livret', name: 'Livret A', bank: 'LBP', balance: '8 120,00' },
  { id: 'epargne', name: 'Épargne logement', bank: 'Crédit Agricole', balance: '—' },
];

export const MOCK_TX: TxRow[] = [
  {
    date: '14/05',
    icon: 'incoming',
    main: 'Virement reçu — Acme SAS',
    sub: 'VIR EUROPEEN EMIS',
    catColor: '#6FA582',
    catName: 'Revenus',
    amount: 3240,
    amountKind: 'income',
    conf: '0,99',
  },
  {
    date: '14/05',
    icon: 'shop',
    main: 'Carrefour Market',
    sub: 'CB 14/05 · PARIS 11',
    catColor: '#7AB890',
    catName: 'Alimentation',
    amount: -84.3,
    amountKind: 'expense',
    conf: '0,94',
  },
  {
    date: '12/05',
    icon: 'car',
    main: 'SNCF Connect',
    sub: 'CB 12/05 · LYON',
    catColor: '#8AA8C7',
    catName: 'Transport',
    amount: -119,
    amountKind: 'expense',
    conf: '0,71',
    confLow: true,
  },
  {
    date: '11/05',
    icon: 'wallet',
    main: 'Virement → Livret A',
    sub: 'VIR INTERNE',
    catColor: '#6E6E78',
    catName: 'Transferts',
    amount: 500,
    amountKind: 'transfer',
    conf: '—',
  },
  {
    date: '10/05',
    icon: 'tv',
    main: 'Spotify',
    sub: 'PRELEV SEPA',
    catColor: '#8D7DC4',
    catName: 'Abonnements',
    amount: -10.99,
    amountKind: 'expense',
    conf: '1,00',
  },
  {
    date: '09/05',
    icon: 'utensils',
    main: 'BOULANGER MARTIN',
    sub: 'CB 09/05 · PARIS 11',
    catColor: '#E07365',
    catName: 'Restaurants',
    amount: -14.8,
    amountKind: 'expense',
    conf: '0,78',
    confLow: true,
  },
];
