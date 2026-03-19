import { readFile, writeFile } from 'node:fs/promises';

const labIndexPath = new URL('../dist/lab/index.html', import.meta.url);

const source = await readFile(labIndexPath, 'utf8');
const cleaned = source.replace(
  /\s*<link rel="manifest" href="\/(?:Dice-Placement-Prototype\/)?manifest\.webmanifest"><\/head>/,
  '\n  </head>'
);

if (source !== cleaned) {
  await writeFile(labIndexPath, cleaned, 'utf8');
}
