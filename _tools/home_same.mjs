// Check that the home page markup is unchanged apart from the lines we expect.
// Usage: node home_same.mjs <before_index.html> <after_index.html> [<regex of lines allowed to be added> ...]
// Compares <head> (without the inline <style>) and <body> (without the final inline <script>) line by line.
import fs from 'node:fs';

const [beforeFile, afterFile, ...allow] = process.argv.slice(2);
const allowRe = allow.map(a => new RegExp(a));
const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const strip = s => {
  const styleStart = s.indexOf('<style>');
  const styleEnd = s.indexOf('</style>', styleStart);
  const scriptStart = s.lastIndexOf('<script>');
  const scriptEnd = s.indexOf('</script>', scriptStart);
  return {
    markup: s.slice(0, styleStart) + '<style></style>' + s.slice(styleEnd + 8, scriptStart) + '<script></script>' + s.slice(scriptEnd + 9),
    style: s.slice(styleStart, styleEnd),
    script: s.slice(scriptStart, scriptEnd),
  };
};
const a = strip(read(beforeFile));
const b = strip(read(afterFile));
const la = a.markup.split('\n').map(l => l.trim()).filter(Boolean);
const lb = b.markup.split('\n').map(l => l.trim()).filter(Boolean);
const kept = lb.filter(l => !allowRe.some(r => r.test(l)));
const added = lb.filter(l => allowRe.some(r => r.test(l)));
console.log('markup lines: before', la.length, 'after', lb.length, '| allowed additions:', added.length);
added.forEach(l => console.log('  + ' + l));
let ok = la.length === kept.length;
for (let i = 0; i < Math.max(la.length, kept.length); i++) {
  if (la[i] !== kept[i]) { ok = false; console.log('FIRST DIFFERENCE at line', i + 1); console.log('  before: ' + la[i]); console.log('  after : ' + kept[i]); break; }
}
console.log(ok ? 'MARKUP IDENTICAL apart from the allowed additions' : 'MARKUP DIFFERS');
console.log('inline style chars: before', a.style.length, 'after', b.style.length, '| inline script chars: before', a.script.length, 'after', b.script.length);
process.exit(ok ? 0 : 1);
