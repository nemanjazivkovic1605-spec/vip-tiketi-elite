import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const output=new URL('../server/publicFootball/view.js',import.meta.url);
// Vercel's Node tracer resolves .js -> .ts but not .js -> .tsx.
await build({
  absWorkingDir:fileURLToPath(new URL('../',import.meta.url)),
  entryPoints:['server/publicFootball/view.tsx'],outfile:'server/publicFootball/view.js',
  platform:'node',target:'node24',format:'esm',bundle:true,packages:'external',
  jsx:'automatic',logLevel:'warning',
});
const view=await import(output.href);
assert.equal(typeof view.renderPublicFootball,'function');
assert(view.renderPublicError('Provera <izlaza>',503).includes('Provera &lt;izlaza&gt;'));
console.log('Public football SSR bundle built and verified with native Node.js.');
