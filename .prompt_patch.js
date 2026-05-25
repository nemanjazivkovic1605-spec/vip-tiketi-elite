const fs = require('fs');
const path = 'api/generate-daily-analysis.ts';
let text = fs.readFileSync(path, 'utf8');
const start = text.indexOf('const MASTER_PROMPT = `');
const end = text.indexOf('\n\nconst normalizeText = (value: unknown, fallback = \'\') =>', start);
console.log('START=', start, 'END=', end, 'FOUND_MARKER=', start !== -1 && end !== -1);
if (start !== -1) {
  console.log('BLOCK SAMPLE:\n', text.slice(start, Math.min(text.length, start + 500)));
}
