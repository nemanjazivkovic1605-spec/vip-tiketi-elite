import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('.vercel/output/functions');
const maximum = Number(process.argv.find(arg => arg.startsWith('--max='))?.split('=')[1] || 9);
async function functionDirs(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(directory, entry.name);
    found.push(...(entry.name.endsWith('.func') ? [fullPath] : await functionDirs(fullPath)));
  }
  return found;
}
async function bytes(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    total += entry.isDirectory() ? await bytes(fullPath) : (await stat(fullPath)).size;
  }
  return total;
}
const directories = await functionDirs(root);
const functions = [];
for (const directory of directories) {
  const config = JSON.parse(await readFile(path.join(directory, '.vc-config.json'), 'utf8'));
  functions.push({
    name: path.relative(root, directory).replaceAll('\\', '/'), runtime: config.runtime,
    maxDuration: config.maxDuration, memory: config.memory,
    uncompressedMiB: Number(((await bytes(directory)) / 1024 ** 2).toFixed(2)),
  });
}
console.log(JSON.stringify({ count: functions.length, maximum, hobbyRemaining: 12 - functions.length, functions }, null, 2));
if (functions.length > maximum || functions.some(item => item.uncompressedMiB > 250)) process.exitCode = 1;
