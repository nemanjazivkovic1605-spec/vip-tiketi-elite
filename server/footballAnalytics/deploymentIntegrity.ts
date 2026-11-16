import { createHash } from 'node:crypto';

const mask = (1n << 256n) - 1n;
export function deploymentRowHash(values: unknown[]) {
  const digest = createHash('sha256');
  for (const value of values) {
    if (value === null || value === undefined) digest.update('N;');
    else { const text = String(value); digest.update(`V${Buffer.byteLength(text)}:`); digest.update(text); }
  }
  return digest.digest('hex');
}
export function deploymentDigest() {
  let count = 0, sum = 0n, xor = 0n;
  return {
    add(hash: string) {
      if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid row digest.');
      const value = BigInt(`0x${hash}`); count++; sum = (sum + value) & mask; xor ^= value;
    },
    value: () => ({ count, sum: sum.toString(16).padStart(64, '0'), xor: xor.toString(16).padStart(64, '0') }),
  };
}
export const sqlIdentifier = (name: string) => {
  if (!/^[a-z_][a-z_0-9]*$/.test(name)) throw new Error('Unexpected SQL identifier.');
  return `"${name}"`;
};
export function postgresDeploymentHash(columns: string[]) {
  return `encode(sha256(convert_to(concat(${columns.map(name => {
    const column = sqlIdentifier(name);
    return `CASE WHEN ${column} IS NULL THEN 'N;' ELSE 'V'||octet_length(${column}::text)::text||':'||${column}::text END`;
  }).join(',')}),'UTF8')),'hex')`;
}
export function productionSourceScope(columns: string[]) {
  if (columns.includes('environment')) return "WHERE environment='real'";
  if (columns.includes('payload')) return "WHERE COALESCE(json_extract(payload,'$.environment'),'real') != 'test'";
  return '';
}
