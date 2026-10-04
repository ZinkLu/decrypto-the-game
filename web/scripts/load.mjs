import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const urls = new Map();

/**
 * A module of src/console as a data: URL, together with every sibling it imports.
 * Each module is loaded once, however many tests and modules import it.
 */
export function moduleUrl(name) {
  if (!urls.has(name)) urls.set(name, build(name));
  return urls.get(name);
}

async function build(name) {
  const source = await readFile(new URL(`../src/console/${name}.ts`, import.meta.url), 'utf8');
  let js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  // Imports of types are gone by now; what is left has to be there at run time.
  const siblings = new Set([...js.matchAll(/from '\.\/(\w+)'/g)].map(match => match[1]));
  for (const sibling of siblings) js = js.replaceAll(`from './${sibling}'`, `from '${await moduleUrl(sibling)}'`);
  return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
}
