// Where the app keeps what users make. In the cloud these sit on a Cloud Storage mount (DATA_DIR=/data).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const publicDir = path.join(root, 'public');
/** Accounts and other server-only data. Never served. */
export const dataDir = process.env.DATA_DIR || path.join(root, 'data');
