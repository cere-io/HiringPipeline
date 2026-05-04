// Generates manifest.demo.json for each widget by inlining data.json's payload
// into the SQL as a string literal. Use this for the demo: rename
// manifest.demo.json → manifest.json before uploading to ROB Sandbox.
//
// Why: hiring cubbies are Redis-Stack JSON, but the widget runtime queries
// SQLite. Inline SELECT skips needing a SQLite cubby projection.
//
// Run: node widgets/_build-demo-manifests.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const widgets = ['rubric-diff', 'score-evolution', 'top-signals'];

for (const w of widgets) {
  const dir = resolve(here, w);
  const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8'));
  const data = JSON.parse(readFileSync(resolve(dir, 'data.json'), 'utf8'));

  // First row, first column = the payload object
  const payloadObj = data.rows[0][0];
  const payloadJson = JSON.stringify(payloadObj);

  // Escape single quotes for SQL literal (double them per SQL standard).
  const sqlSafe = payloadJson.replace(/'/g, "''");

  manifest.query.sql = `SELECT '${sqlSafe}' AS payload`;
  manifest.query.params = [];
  manifest.query.urlParams = [];
  manifest.query.id = manifest.query.id + '-inline';
  manifest.query.label = manifest.query.label + ' (inline demo data)';
  // The runtime still requires a sqliteCubby reference even though we don't
  // read from it. Leave the existing alias — replace cubbyId with whatever
  // SQLite cubby is attached to your workspace before uploading.

  writeFileSync(resolve(dir, 'manifest.demo.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`wrote ${w}/manifest.demo.json  (${payloadJson.length} bytes payload)`);
}
