#!/usr/bin/env node
/**
 * Guards the split web API surface (src/lib/api/*): every TOP-LEVEL export name
 * must be unique across the domain modules, because index.ts recomposes them
 * with `export *` — if two modules exported the same name (e.g. both a
 * `productsApi`, or two `type Address`), the re-export is ambiguous and one
 * silently wins. This is the web analogue of admin's object-spread guard.
 *
 * (Method names *inside* a domain object may repeat freely — `cartApi.get` and
 * `notificationsApi.get` are namespaced by their const, so only the const/type
 * export names are checked.)
 *
 * Run: `node scripts/check-api-collisions.mjs` (wired into `pnpm test:api`).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'api');

// index.ts is the barrel that re-exports everyone — it defines no new surface.
const SKIP = new Set(['index.ts']);
// Top-level `export const|let|var|function|class|type|interface|enum NAME`.
const EXPORT =
	/^export\s+(?:async\s+)?(?:const|let|var|function|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/;
// `export { a, b as c }` re-export lists.
const EXPORT_LIST = /^export\s+\{([^}]*)\}/;

const owners = new Map(); // name -> [files]
const add = (name, file) => {
	if (!owners.has(name)) owners.set(name, []);
	if (!owners.get(name).includes(file)) owners.get(name).push(file);
};

for (const file of readdirSync(apiDir)) {
	if (!file.endsWith('.ts') || SKIP.has(file)) continue;
	const lines = readFileSync(join(apiDir, file), 'utf8').split('\n');
	for (const line of lines) {
		const trimmed = line.trimStart();
		const m = EXPORT.exec(trimmed);
		if (m) {
			add(m[1], file);
			continue;
		}
		const l = EXPORT_LIST.exec(trimmed);
		if (l) {
			for (const part of l[1].split(',')) {
				const name = part.trim().split(/\s+as\s+/).pop()?.trim();
				if (name) add(name, file);
			}
		}
	}
}

const collisions = [...owners.entries()].filter(([, files]) => files.length > 1);

if (collisions.length) {
	console.error(`✗ ${collisions.length} duplicate web API export name(s) across lib/api/*:`);
	for (const [name, files] of collisions) {
		console.error(`  - ${name}: ${files.join(', ')}`);
	}
	process.exit(1);
}

console.log(`✓ ${owners.size} web API exports, all names unique across lib/api/*.`);
