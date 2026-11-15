// Every piece of page copy must exist in both Bangla and English, with the same shape.
import assert from "node:assert/strict";
import test from "node:test";
import * as content from "../src/content.js";

const LANGS = ["bn", "en"];
const placeholders = (text) => [...text.matchAll(/\{[a-zA-Z]+\}/g)].map((m) => m[0]).sort();
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// Walks a bn value and its en counterpart side by side and returns every mismatch.
function compareShape(bn, en, path, problems) {
  if (Array.isArray(bn) || Array.isArray(en)) {
    if (!Array.isArray(bn) || !Array.isArray(en)) return problems.push(`${path}: array in one language only`);
    if (bn.length !== en.length) problems.push(`${path}: bn has ${bn.length} items, en has ${en.length}`);
    bn.slice(0, en.length).forEach((item, i) => compareShape(item, en[i], `${path}[${i}]`, problems));
    return problems;
  }
  if (isPlainObject(bn) || isPlainObject(en)) {
    if (!isPlainObject(bn) || !isPlainObject(en)) return problems.push(`${path}: object in one language only`);
    for (const key of Object.keys(bn)) if (!(key in en)) problems.push(`${path}.${key}: missing in en`);
    for (const key of Object.keys(en)) if (!(key in bn)) problems.push(`${path}.${key}: missing in bn`);
    for (const key of Object.keys(bn)) if (key in en) compareShape(bn[key], en[key], `${path}.${key}`, problems);
    return problems;
  }
  if (typeof bn !== typeof en) return problems.push(`${path}: bn is ${typeof bn}, en is ${typeof en}`);
  if (typeof bn === "string") {
    if (!bn.trim()) problems.push(`${path}: empty in bn`);
    if (!en.trim()) problems.push(`${path}: empty in en`);
    if (placeholders(bn).join() !== placeholders(en).join()) problems.push(`${path}: placeholders differ (${placeholders(bn)} vs ${placeholders(en)})`);
  }
  return problems;
}

// Finds every { bn, en } pair anywhere in the module's exports.
function bilingualPairs(value, path, found = []) {
  if (Array.isArray(value)) value.forEach((item, i) => bilingualPairs(item, `${path}[${i}]`, found));
  else if (isPlainObject(value)) {
    if (LANGS.some((lang) => lang in value)) found.push([path, value]);
    else for (const [key, child] of Object.entries(value)) bilingualPairs(child, `${path}.${key}`, found);
  }
  return found;
}

const pairs = bilingualPairs(Object.fromEntries(Object.entries(content)), "content");

test("finds the bilingual blocks to check", () => {
  const paths = pairs.map(([path]) => path);
  for (const expected of ["content.meta", "content.copy", "content.steps", "content.faqs", "content.legal", "content.pillars[0]"]) {
    assert.ok(paths.includes(expected), `expected ${expected} to be checked; found ${paths.join(", ")}`);
  }
});

test("every bn key has an en counterpart and vice versa", () => {
  const problems = [];
  for (const [path, value] of pairs) {
    for (const lang of LANGS) if (!(lang in value)) problems.push(`${path}: no ${lang} block`);
    if (LANGS.every((lang) => lang in value)) compareShape(value.bn, value.en, path, problems);
  }
  assert.deepEqual(problems, []);
});

test("navigation targets are the same section ids in both languages", () => {
  assert.deepEqual(content.copy.bn.nav.map(([id]) => id), content.copy.en.nav.map(([id]) => id));
});

test("tuple lists carry both a bn and an en text for every item", () => {
  const problems = [];
  const check = (name, rows, width) => rows.forEach((row, i) => {
    if (row.length !== width) problems.push(`${name}[${i}]: expected ${width} fields, got ${row.length}`);
    row.forEach((field, j) => { if (typeof field !== "string" || !field.trim()) problems.push(`${name}[${i}][${j}]: empty`); });
  });
  check("workTypes", content.workTypes, 3); // [key, bn, en]
  check("features", content.features, 5); // [icon, bnTitle, bnBody, enTitle, enBody]
  check("safetyPoints", content.safetyPoints, 5);
  check("comingSoonFeature", [content.comingSoonFeature], 5);
  assert.deepEqual(problems, []);
});

test("pillars have a known status and price", () => {
  for (const pillar of content.pillars) {
    assert.ok(["live", "soon"].includes(pillar.status), `${pillar.key}: status ${pillar.status}`);
    assert.ok(["subscription", "free", null].includes(pillar.price), `${pillar.key}: price ${pillar.price}`);
  }
  assert.deepEqual(content.pillars.map((p) => p.key), ["work", "learn", "business", "community"]);
});
