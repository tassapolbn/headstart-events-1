import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';

// Keep the public editor preview and Apps Script email markup identical.
const path = new URL('../apps-script/EmailRelay.gs', import.meta.url);
const start = '// BEGIN GENERATED EMAIL RENDERER';
const end = '// END GENERATED EMAIL RENDERER';
const read = name => readFileSync(new URL('../src/lib/' + name, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const slice = (source, from, to) => source.slice(source.indexOf(from), source.indexOf(to));
const helpers = slice(read('richText.ts'), 'export function safeColor', 'function safeStyle') +
  slice(read('merge.ts'), 'export function renderMergeFields', 'export function mergeMapForRegistration');
const input = (helpers + read('emailDesign.ts') + read('emailHtml.ts')).replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const compiled = ts.transpileModule(input, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText;
const generated = `var HeadStartEmail = (function () {\n${compiled}\nreturn { buildEmailHtml: buildEmailHtml };\n})();\n`;
const source = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const base = source.includes(start) ? source.slice(0, source.indexOf(start)).trimEnd() : source.trimEnd();
const next = `${base}\n\n${start}\n// Generated from src/lib/emailHtml.ts. Run node scripts/build-email-relay.mjs after changes.\n${generated}${end}\n`;
if (process.argv.includes('--check')) {
  if (source !== next) throw new Error('Email relay renderer is out of date. Run node scripts/build-email-relay.mjs.');
} else writeFileSync(path, next);
