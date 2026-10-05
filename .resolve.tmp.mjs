import fs from "node:fs";
// Replace the Nth conflict block (in file order) with given text.
export function resolve(file, replacements) {
  const s = fs.readFileSync(file, "utf8");
  const re = /<<<<<<< [^\n]*\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> [^\n]*\n/g;
  let i = 0;
  const out = s.replace(re, (m, ours, theirs) => {
    const r = replacements[i++];
    if (r === undefined) throw new Error(`${file}: no replacement for block ${i}`);
    return typeof r === "function" ? r(ours, theirs) : r;
  });
  if (i !== replacements.length) throw new Error(`${file}: expected ${replacements.length} blocks, found ${i}`);
  fs.writeFileSync(file, out);
}
