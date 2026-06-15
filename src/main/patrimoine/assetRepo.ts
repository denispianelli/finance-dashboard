import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { AssetDTO, UpsertAssetInput } from '@shared/types/patrimoine';

interface AssetRow {
  id: string;
  name: string;
  kind: string;
  declared_value: number;
  share: number;
  valued_at: string;
  notes: string | null;
  class_id: string | null;
}

function toDto(r: AssetRow): AssetDTO {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    declaredValue: r.declared_value,
    share: r.share,
    valuedAt: r.valued_at,
    notes: r.notes,
    classId: r.class_id,
  };
}

export function upsertAsset(db: DatabaseSync, input: UpsertAssetInput): AssetDTO {
  const id = input.id ?? randomUUID();
  db.prepare(
    `INSERT INTO assets (id, name, kind, declared_value, share, valued_at, class_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       declared_value = excluded.declared_value,
       share = excluded.share,
       valued_at = excluded.valued_at,
       class_id = excluded.class_id`,
  ).run(
    id,
    input.name,
    input.kind,
    input.declaredValue,
    input.share,
    input.valuedAt,
    input.classId ?? null,
  );
  const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as unknown as AssetRow;
  return toDto(row);
}

export function listAssets(db: DatabaseSync): AssetDTO[] {
  return (
    db.prepare('SELECT * FROM assets ORDER BY created_at ASC').all() as unknown as AssetRow[]
  ).map(toDto);
}

export function deleteAsset(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM assets WHERE id = ?').run(id);
}
