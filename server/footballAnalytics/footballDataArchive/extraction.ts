import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Open } from 'unzipper';
import { crc32 } from 'node:zlib';
import { sha256 } from './normalization.js';
import type { ArchiveFile } from './staging.js';

export function archiveEntryPath(root: string, entry: string) {
  const relative = entry.replace(/\\/g, '/');
  if (relative.includes('\0') || /(^\/|:|(^|\/)\.\.(\/|$))/.test(relative)) throw new Error('Unsafe archive path.');
  const target = path.resolve(root, relative), inside = path.relative(path.resolve(root), target);
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) throw new Error('Unsafe archive path.');
  return target;
}
function rejectSymlinkParents(target: string, root: string) {
  for (let current = target; current.startsWith(root); current = path.dirname(current)) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error('Symlink extraction target rejected.');
    if (current === root) break;
  }
}
export async function extractFootballArchive(archive: string, destination: string, allowedRoot: string) {
  const relative = path.relative(path.resolve(allowedRoot), path.resolve(destination));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Extraction must stay inside .local-data.');
  const zip = await Open.file(archive);
  if (zip.files.length > 2000) throw new Error('Too many archive entries.');
  const entries = zip.files.filter((entry: any) => /\.csv$/i.test(entry.path));
  if (entries.reduce((total: number, entry: any) => total + entry.uncompressedSize, 0) > 1024 ** 3) throw new Error('Archive expanded size exceeds limit.');
  const seen = new Set<string>();
  for (const entry of entries) {
    const target = archiveEntryPath(destination, entry.path), key = target.toLowerCase();
    if (entry.type !== 'File' || entry.uncompressedSize > 20 * 1024 ** 2
      || (entry.externalFileAttributes >>> 16 & 0xf000) === 0xa000 || seen.has(key)) throw new Error('Duplicate, oversized or symbolic archive entry rejected.');
    seen.add(key); rejectSymlinkParents(target, path.resolve(allowedRoot));
  }
  mkdirSync(destination, { recursive: true });
  if (!realpathSync(destination).startsWith(realpathSync(allowedRoot) + path.sep)) throw new Error('Resolved extraction path escapes allowed root.');
  const manifest: ArchiveFile[] = [];
  for (const entry of entries) {
    const chunks: Buffer[] = [], stream = entry.stream();
    let length = 0;
    try {
      for await (const chunk of stream) {
        length += chunk.length;
        if (length > entry.uncompressedSize || length > 20 * 1024 ** 2) throw new Error('Expanded entry exceeds declared size.');
        chunks.push(Buffer.from(chunk));
      }
    } finally { stream.destroy(); }
    if (length !== entry.uncompressedSize) throw new Error('Expanded entry length mismatch.');
    const bytes = Buffer.concat(chunks), hash = sha256(bytes), target = archiveEntryPath(destination, entry.path);
    if (crc32(bytes) !== entry.crc32) throw new Error('Archive entry CRC mismatch.');
    rejectSymlinkParents(target, path.resolve(allowedRoot));
    mkdirSync(path.dirname(target), { recursive: true });
    if (existsSync(target)) {
      if (sha256(readFileSync(target)) !== hash) throw new Error('Existing extracted file differs; refusing overwrite.');
    } else writeFileSync(target, bytes, { flag: 'wx' });
    manifest.push({ name: entry.path, bytes: length, sha256: hash });
  }
  writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}
