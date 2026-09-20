// Copies graphify's graph.html into public/structure/ and re-colors it with
// the console tokens (dark values of app/globals.css). Run after
// `graphify update`; the output is committed because the Vercel project's
// root is dashboard/ and cannot see ../graphify-out.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../../graphify-out/graph.html', import.meta.url));
const out = fileURLToPath(new URL('../public/structure/graph.html', import.meta.url));
let html = readFileSync(src, 'utf8');

const swap = (text, map) => Object.entries(map).reduce((t, [a, b]) => t.replaceAll(a, b), text);

// UI chrome -> --as-* dark tokens.
const chrome = {
  '#0f0f1a': '#0b0e14', // surface-0
  '#1a1a2e': '#11151d', // surface-1
  '#2a2a4e': '#242b38', // hairline
  '#3a3a5e': '#364052', // hairline-strong
  '#4E79A7': '#2ee6a6', // signal
  '#e0e0e0': '#e9edf4', // ink
  '#ccc': '#9aa4b5', // ink-muted
  '#aaa': '#9aa4b5',
  '#666': '#7d889b', // ink-faint
  '#555': '#7d889b',
  'solid #fff': 'solid #06130d', // on-signal
  'background: #fff; border: none': 'background: #06130d; border: none',
  '-apple-system, BlinkMacSystemFont': '"Space Grotesk", -apple-system, BlinkMacSystemFont',
};
// Community colors: graphify's Tableau-10 cycle -> the project palette.
const nodes = {
  '#4E79A7': '#6B9BFF', // pulse
  '#F28E2B': '#FFB03A', // amber
  '#E15759': '#FF6262', // danger
  '#76B7B2': '#2EE6A6', // signal
  '#59A14F': '#60C874', // success
  '#EDC948': '#F0E08A',
  '#B07AA1': '#B79CFF',
  '#FF9DA7': '#F57A70',
  '#9C755F': '#A8A49E', // neutral
  '#BAB0AC': '#7D889B', // ink-faint
};

const cut = html.indexOf('</style>');
html = swap(html.slice(0, cut), chrome) + swap(html.slice(cut), nodes);
html = html
  .replace('<title>graphify - graphify-out/graph.html</title>', '<title>Project structure: Anchor Status</title>')
  .replace('edges: { smooth:', "edges: { color: { color: '#364052', highlight: '#2ee6a6', hover: '#6B9BFF' }, smooth:")
  .replace("ctx.fillStyle = '#6366f1'", "ctx.fillStyle = '#2ee6a6'")
  .replace("ctx.strokeStyle = '#6366f1'", "ctx.strokeStyle = '#2ee6a6'")
  .replace("ctx.fillStyle = '#4f46e5'", "ctx.fillStyle = '#6B9BFF'");

writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1e6).toFixed(2)} MB)`);
