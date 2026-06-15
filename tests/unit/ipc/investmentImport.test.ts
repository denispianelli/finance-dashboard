// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runMigrations } from '../../../src/main/db/migrate';

const db = new DatabaseSync(':memory:');
runMigrations(db);
vi.mock('../../../src/main/db', () => ({ getDb: () => db }));
vi.mock('electron', () => ({ dialog: { showOpenDialog: vi.fn() } }));

const { handleInvestmentCreateWrapper } = await import('../../../src/main/ipc/handlers/investment');
const { handleInvestmentImportBourseCsv, handleInvestmentListOperations } =
  await import('../../../src/main/ipc/handlers/investment');

beforeEach(() => {
  db.exec(
    'DELETE FROM support_operations; DELETE FROM support_flows; DELETE FROM support_valuations; DELETE FROM investment_supports; DELETE FROM investment_wrappers;',
  );
});

describe('investment CSV import IPC', () => {
  it('imports a CSV file into a wrapper and lists operations', () => {
    const { wrapper } = handleInvestmentCreateWrapper({ name: 'PEA', type: 'pea' });

    // Write a synthetic latin-1 CSV to a temp file.
    const HEADER =
      "libellé;Opération;Place;Date;Qté;Prix d'éxé;Montant brut;Courtage/Prélèvement;Montant net;Devise;";
    const csv = [
      HEADER,
      'WORLD ETF;Achat Comptant;Euronext Paris;01/01/2025;100;5;-500;-2;-502;EUR;',
    ].join('\r\n');
    const path = join(tmpdir(), `fortuneo-${String(Date.now())}.csv`);
    writeFileSync(path, csv, { encoding: 'latin1' });

    const { result } = handleInvestmentImportBourseCsv({ path, wrapperId: wrapper.id });
    expect(result.operationsImported).toBe(1);
    expect(result.createdSupports).toHaveLength(1);

    const supportId = result.createdSupports[0]?.id ?? '';
    expect(handleInvestmentListOperations({ supportId }).operations).toHaveLength(1);
  });
});
