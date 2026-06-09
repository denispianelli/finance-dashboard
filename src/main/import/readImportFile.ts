import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { ImportError } from './importError';

// The only extensions a legitimate import ever carries. Both entry points that
// produce a path — the OS file dialog and drag-drop (webUtils.getPathForFile) —
// already restrict to these, so this never rejects a real import. It exists to
// stop a *compromised renderer* from replaying an arbitrary path (e.g.
// /etc/passwd, ~/.ssh/id_rsa) into the readFileSync the import handlers perform:
// without an allowed statement extension the bytes are never read. Defence in
// depth — the renderer has no known code-execution vector today (ADR-002).
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.ofx', '.csv']);

/**
 * Read a renderer-supplied import path, refusing anything that is not a regular
 * file with a statement extension. Throws ImportError('unsupported_format') for
 * a disallowed extension or a non-file; lets fs errors (missing file, no
 * permission) propagate as before.
 */
export function readImportFile(filePath: string): Buffer {
  if (!ALLOWED_EXTENSIONS.has(extname(filePath).toLowerCase())) {
    throw new ImportError('unsupported_format');
  }
  if (!statSync(filePath).isFile()) {
    throw new ImportError('unsupported_format');
  }
  return readFileSync(filePath);
}
