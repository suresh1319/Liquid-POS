const fs = require('fs');
const path = 'js/components/CheckoutSheet.js';
const s = fs.readFileSync(path, 'utf8');
const counts = {
  backticks: (s.match(/`/g) || []).length,
  parenOpen: (s.match(/\(/g) || []).length,
  parenClose: (s.match(/\)/g) || []).length,
  braceOpen: (s.match(/\{/g) || []).length,
  braceClose: (s.match(/\}/g) || []).length,
  sqOpen: (s.match(/\[/g) || []).length,
  sqClose: (s.match(/\]/g) || []).length,
};
console.log(counts);
// Print a small window around the reported line to help debugging
const lines = s.split('\n');
const reportLine = 4363 - 1; // zero indexed
const start = Math.max(0, reportLine - 8);
const end = Math.min(lines.length, reportLine + 8);
console.log('--- surrounding lines ---');
for (let i=start;i<end;i++) console.log((i+1).toString().padStart(5)+" | "+lines[i]);
