// Builds dist/nutrilongevity.html: the whole app as one page for publishing on claude.ai.
// The browser code is bundled with public/js/api.js swapped for artifact/api.js, which keeps data
// in the artifact database and uses Claude through the page's runtime capabilities.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const swapApi = {
  name: 'swap-api',
  setup(b) {
    b.onResolve({ filter: /^\/shared\// }, (a) => ({ path: path.join(root, a.path) }));
    b.onResolve({ filter: /(^|\/)api\.js$/ }, (a) => {
      const resolved = path.resolve(a.resolveDir, a.path);
      return resolved === path.join(root, 'public/js/api.js') ? { path: path.join(root, 'artifact/api.js') } : undefined;
    });
  },
};
const out = await build({
  entryPoints: [path.join(root, 'artifact/entry.js')], bundle: true, format: 'esm', write: false,
  minify: true, target: 'es2022', plugins: [swapApi], legalComments: 'none',
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');
const html = `<title>NutriLongevity AI</title>
<meta name="description" content="Evidence-based personalised nutrition for healthy ageing.">
<style>
${css}
</style>
<div id="app"><div class="boot"><div class="spinner"></div></div></div>
<div id="toasts" aria-live="polite"></div>
<script type="module">
${js}
</script>
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/nutrilongevity.html'), html);
console.log(`dist/nutrilongevity.html ${(html.length / 1024).toFixed(0)} KB`);
