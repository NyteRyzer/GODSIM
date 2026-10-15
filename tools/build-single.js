// Builds GODSIM.html: one self-contained file (all CSS and JS inlined) that runs by double-clicking it.
// Usage: node tools/build-single.js [--fragment out.html]   (--fragment omits the <html>/<head>/<body> wrapper)
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

let out = html.replace(/<link rel="stylesheet" href="([^"]+)"\s*\/?>/g, (m, href) => `<style>\n${fs.readFileSync(path.join(root, href), 'utf8')}\n</style>`);
out = out.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const code = fs.readFileSync(path.join(root, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script>/* ${src} */\n${code}\n</script>`;
});

const args = process.argv.slice(2);
const fi = args.indexOf('--fragment');
if (fi >= 0) {
  // Body-only variant for hosts that supply their own document skeleton.
  const title = (out.match(/<title>[\s\S]*?<\/title>/) || [''])[0];
  const styles = (out.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n');
  const open = out.match(/<body[^>]*>/);
  const body = out.slice(open.index + open[0].length, out.lastIndexOf('</body>'));
  const frag = `${title}\n<meta name="color-scheme" content="dark">\n${styles}\n<style>:root{color-scheme:dark;background:#0b1020}#app{height:100%}</style>\n${body}`;
  fs.writeFileSync(args[fi + 1], frag);
  console.log('wrote', args[fi + 1], frag.length, 'bytes');
} else {
  fs.writeFileSync(path.join(root, 'GODSIM.html'), out);
  console.log('wrote GODSIM.html', out.length, 'bytes');
}
