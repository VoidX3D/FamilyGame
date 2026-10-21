/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
/* Editable game content with optional file persistence.
 *
 * Defaults are loaded from server/data/default-content.json. The host console
 * can replace any collection; edits are normalized, validated, and written to
 * server/data/content.json so they survive a restart.
 *
 * Set CONTENT_FILE=:memory: to disable disk persistence (tests and previews).
 */

import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import crypto from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url));
/* The shape of the collections: one JSON entry per collection. */
export const SCHEMA_FILE = path.join(here, "data", "content-schema.json");
export const DEFAULT_CONTENT_FILE = path.join(
  here,
  "data",
  "default-content.json",
);
export const CONTENT_FILE =
  config.contentFile;
const MEMORY_ONLY = CONTENT_FILE === ":memory:";
let writeQueue = Promise.resolve();

export class ContentValidationError extends Error {
  constructor(details) {
    super("Some content entries are invalid.");
    this.name = "ContentValidationError";
    this.code = "invalid_content";
    this.details = details;
  }
}

/* The shape of every collection.
 *
 * It lives in server/data/content-schema.json, so a new collection is a
 * JSON entry and not a change to this file. The built-in copy below is only
 * used if that file is missing or broken, so the server always starts.
 */
const BUILTIN_COLLECTIONS = [
  {
    key: "oneOfUsWords",
    label: "One of Us words",
    game: "One of Us",
    kind: "record",
    fields: [
      { key: "word", label: "Word", type: "text", max: 60, required: true },
      { key: "category", label: "Category", type: "text", max: 30 },
    ],
  },
  {
    key: "whoIsItQuestions",
    label: "Who Is It questions",
    game: "Who Is It?",
    kind: "text",
    max: 160,
  },
  {
    key: "people",
    label: "Who Am I people",
    game: "Who Am I?",
    kind: "record",
    fields: [
      { key: "name", label: "Name", type: "text", max: 80, required: true },
      {
        key: "hints",
        label: "Host notes (one per line)",
        type: "lines",
        max: 120,
        maxItems: 4,
        minItems: 1,
      },
      { key: "group", label: "Group", type: "text", max: 40 },
      {
        key: "aliases",
        label: "Also accepted (one per line)",
        type: "lines",
        max: 80,
        maxItems: 8,
      },
    ],
  },
  {
    key: "places",
    label: "Where Am I places",
    game: "Where Am I?",
    kind: "record",
    fields: [
      { key: "name", label: "Place", type: "text", max: 80, required: true },
      {
        key: "hints",
        label: "Host notes (one per line)",
        type: "lines",
        max: 120,
        maxItems: 4,
        minItems: 1,
      },
      { key: "group", label: "Group", type: "text", max: 40 },
      {
        key: "aliases",
        label: "Also accepted (one per line)",
        type: "lines",
        max: 80,
        maxItems: 8,
      },
    ],
  },
  {
    key: "whoWrotePrompts",
    label: "Who Wrote That prompts",
    game: "Who Wrote That?!",
    kind: "text",
    max: 180,
  },
  {
    key: "truths",
    label: "Truth or Dare truths",
    game: "Truth or Dare",
    kind: "text",
    max: 180,
  },
  {
    key: "dares",
    label: "Truth or Dare dares",
    game: "Truth or Dare",
    kind: "text",
    max: 180,
  },
  {
    key: "charades",
    label: "Act It Out prompts",
    game: "Act It Out",
    kind: "record",
    fields: [
      { key: "text", label: "Prompt", type: "text", max: 120, required: true },
      { key: "category", label: "Category", type: "text", max: 30 },
    ],
  },
  {
    key: "drawingWords",
    label: "Draw It words",
    game: "Draw It",
    kind: "record",
    fields: [
      { key: "word", label: "Word", type: "text", max: 60, required: true },
      { key: "category", label: "Category", type: "text", max: 30 },
    ],
  },
  {
    key: "emojiPuzzles",
    label: "Emoji Guess puzzles",
    game: "Emoji Guess",
    kind: "record",
    fields: [
      { key: "emoji", label: "Emoji clue", type: "text", max: 80, required: true },
      { key: "name", label: "Answer", type: "text", max: 80, required: true },
      { key: "category", label: "Category", type: "text", max: 30 },
      { key: "aliases", label: "Accepted answers (one per line)", type: "lines", max: 80, maxItems: 8 },
      { key: "hints", label: "Hints (one per line)", type: "lines", max: 120, maxItems: 2 },
    ],
  },
  {
    key: "captionPrompts",
    label: "Caption This prompts",
    game: "Caption This",
    kind: "record",
    fields: [
      { key: "text", label: "Prompt", type: "text", max: 180, required: true },
      { key: "category", label: "Category", type: "text", max: 30 },
    ],
  },
  {
    key: "spyfallLocations",
    label: "Spyfall locations",
    game: "Spyfall",
    kind: "record",
    fields: [
      { key: "name", label: "Location", type: "text", max: 80, required: true },
      { key: "category", label: "Category", type: "text", max: 30 },
      { key: "aliases", label: "Accepted guesses (one per line)", type: "lines", max: 80, maxItems: 8 },
    ],
  },
  {
    key: "wouldYouRatherQuestions",
    label: "Would You Rather questions",
    game: "Would You Rather?",
    kind: "record",
    fields: [
      { key: "optionA", label: "Option A", type: "text", max: 140, required: true },
      { key: "optionB", label: "Option B", type: "text", max: 140, required: true },
      { key: "category", label: "Category", type: "text", max: 30 },
    ],
  },
  {
    key: "twoTruthsTopics",
    label: "Two Truths & One Lie topics",
    game: "Two Truths & One Lie",
    kind: "text",
    max: 120,
  },
];

function loadSchema() {
  try {
    const raw = readFileSync(SCHEMA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const list = parsed?.collections;
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error("the schema file has no collections");
    }
    for (const collection of list) {
      if (!collection?.key || !collection?.kind) {
        throw new Error("a collection is missing its key or kind");
      }
    }
    return list;
  } catch (error) {
    console.warn(
      `[content] could not read ${SCHEMA_FILE} (${error.message}). Using the built-in collection list.`,
    );
    return BUILTIN_COLLECTIONS;
  }
}

export const COLLECTIONS = loadSchema();

function loadDefaultItems() {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(DEFAULT_CONTENT_FILE, "utf8"));
  } catch (error) {
    throw new Error(
      `Could not load default content from ${DEFAULT_CONTENT_FILE}: ${error.message}`,
    );
  }

  const items = parsed?.collections;
  if (!items || typeof items !== "object" || Array.isArray(items)) {
    throw new Error(
      `Default content file ${DEFAULT_CONTENT_FILE} must contain a collections object.`,
    );
  }
  return items;
}

const DEFAULT_ITEMS = loadDefaultItems();

const byKey = new Map(COLLECTIONS.map((collection) => [collection.key, collection]));
const collections = new Map();

let persisted = !MEMORY_ONLY;
let lastError = "";
let loaded = false;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cleanLine(value, max) {
  return Array.from(
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim(),
  )
    .slice(0, max)
    .join("");
}

function cleanLines(value, max, maxItems) {
  const source = Array.isArray(value)
    ? value
    : String(value ?? "").split(/\r?\n/);
  return source
    .map((line) => cleanLine(line, max))
    .filter(Boolean)
    .slice(0, maxItems);
}

function cleanId(value, fallback) {
  const id = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return id || fallback;
}

function normalizeItem(collection, raw, index, usedIds) {
  const errors = [];
  const item = {};
  item.id = cleanId(raw?.id, `${collection.key}-${index + 1}`);
  let suffix = 2;
  while (usedIds.has(item.id)) {
    item.id = `${cleanId(raw?.id, collection.key)}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(item.id);

  if (collection.kind === "text") {
    item.text = cleanLine(raw?.text, collection.max ?? 180);
    if (!item.text) errors.push(`Item ${index + 1}: text is required.`);
    return { item, errors };
  }

  for (const field of collection.fields) {
    if (field.type === "lines") {
      item[field.key] = cleanLines(raw?.[field.key], field.max ?? 120, field.maxItems ?? 8);
      if (field.minItems && item[field.key].length < field.minItems) {
        errors.push(
          `Item ${index + 1}: add at least ${field.minItems} ${field.label.toLowerCase()}.`,
        );
      }
    } else {
      item[field.key] = cleanLine(raw?.[field.key], field.max ?? 120);
      if (field.required && !item[field.key]) {
        errors.push(`Item ${index + 1}: ${field.label.toLowerCase()} is required.`);
      }
    }
  }

  return { item, errors };
}

function normalizeItems(collection, items) {
  if (!Array.isArray(items)) {
    throw new ContentValidationError(["Items must be a list."]);
  }
  if (items.length === 0) {
    throw new ContentValidationError(["Keep at least one item in this collection."]);
  }
  if (items.length > 500) {
    throw new ContentValidationError(["A collection cannot hold more than 500 items."]);
  }

  const normalized = [];
  const errors = [];
  const usedIds = new Set();

  items.forEach((raw, index) => {
    const result = normalizeItem(collection, raw, index, usedIds);
    errors.push(...result.errors);
    if (result.errors.length === 0) normalized.push(result.item);
  });

  if (errors.length > 0) throw new ContentValidationError(errors.slice(0, 12));
  return normalized;
}

function resetToDefaults(key) {
  const collection = byKey.get(key);
  if (!collection) return false;
  collections.set(key, clone(DEFAULT_ITEMS[key] ?? []));
  return true;
}

/* Load the built-in content.
 *
 * A collection that is registered but has no entries in the content file is
 * a mistake, but it must not take the whole site down: the server used to
 * throw here, which meant one missing entry stopped the API from starting
 * and every game with it. Now the collection is reported and left empty,
 * and the engine falls back to its own placeholder, so the rest of the
 * evening still works.
 */
for (const collection of COLLECTIONS) {
  const raw = DEFAULT_ITEMS[collection.key];
  if (!Array.isArray(raw)) {
    const message = `The collection "${collection.key}" is missing from the content file.`;
    lastError = message;
    console.warn(`[content] ${message} The game will use its placeholder.`);
    DEFAULT_ITEMS[collection.key] = [];
    resetToDefaults(collection.key);
    continue;
  }

  try {
    DEFAULT_ITEMS[collection.key] = normalizeItems(collection, raw);
  } catch (error) {
    const details = Array.isArray(error?.details)
      ? error.details.join(" ")
      : error.message;
    const message = `Invalid default content for ${collection.key}: ${details}`;
    lastError = message;
    console.warn(`[content] ${message} The game will use its placeholder.`);
    DEFAULT_ITEMS[collection.key] = [];
  }
  resetToDefaults(collection.key);
}

export function getCollection(key) {
  return collections.get(String(key ?? "")) ?? [];
}

export function collectionCatalog() {
  return COLLECTIONS.map(({ key, label, game, kind, fields, max }) => ({
    key,
    label,
    game,
    kind,
    fields: fields ?? [],
    max,
    count: getCollection(key).length,
  }));
}

export function contentSnapshot() {
  return {
    collections: collectionCatalog(),
    items: Object.fromEntries(
      COLLECTIONS.map((collection) => [
        collection.key,
        clone(getCollection(collection.key)),
      ]),
    ),
    status: contentStatus(),
  };
}

/* A short summary of where the content is and whether it can be saved.
 * The health check uses it, so a problem with the content file shows up
 * before a host tries to edit something. */
export function contentStatus() {
  return {
    file: MEMORY_ONLY ? null : CONTENT_FILE,
    defaultFile: DEFAULT_CONTENT_FILE,
    persisted: MEMORY_ONLY ? true : persisted,
    collections: COLLECTIONS.length,
    entries: COLLECTIONS.reduce(
      (sum, collection) => sum + getCollection(collection.key).length,
      0,
    ),
    error: lastError || null,
  };
}

async function writeContentFile() {
  if (MEMORY_ONLY) return;
  writeQueue = writeQueue.then(async () => {
    const payload = {
      updatedAt: new Date().toISOString(),
      collections: Object.fromEntries(
        COLLECTIONS.map((collection) => [
          collection.key,
          getCollection(collection.key),
        ]),
      ),
    };
    const temporary = `${CONTENT_FILE}.${process.pid}.${crypto.randomUUID()}.tmp`;
    const body = `${JSON.stringify(payload, null, 2)}\n`;
    try {
      await fs.mkdir(path.dirname(CONTENT_FILE), { recursive: true });
      await fs.writeFile(temporary, body, "utf8");
      await fs.rename(temporary, CONTENT_FILE);
      persisted = true;
      lastError = "";
    } catch (error) {
      // A rename can fail on Windows when the file is open elsewhere. The
      // edit still has to land, so it is written directly as a fallback
      // rather than lost.
      try {
        await fs.writeFile(CONTENT_FILE, body, "utf8");
        persisted = true;
        lastError = "";
        await fs.rm(temporary, { force: true }).catch(() => {});
        console.warn(
          `[content] renamed into place failed (${error.message}), wrote ${CONTENT_FILE} directly.`,
        );
        return;
      } catch (fallbackError) {
        persisted = false;
        lastError = fallbackError.message;
        await fs.rm(temporary, { force: true }).catch(() => {});
        console.warn(`[content] could not save ${CONTENT_FILE}: ${fallbackError.message}`);
      }
    }
  });
  await writeQueue;
}

export async function replaceCollection(key, items) {
  const collection = byKey.get(String(key ?? ""));
  if (!collection) return null;
  const normalized = normalizeItems(collection, items);
  collections.set(collection.key, normalized);
  await writeContentFile();
  return clone(normalized);
}

export async function resetCollection(key) {
  if (!resetToDefaults(String(key ?? ""))) return false;
  await writeContentFile();
  return true;
}

export async function resetAllCollections() {
  for (const collection of COLLECTIONS) resetToDefaults(collection.key);
  await writeContentFile();
  return true;
}

export async function loadContent() {
  if (loaded) return contentSnapshot();
  loaded = true;

  if (MEMORY_ONLY) {
    persisted = true;
    return contentSnapshot();
  }

  try {
    const raw = await fs.readFile(CONTENT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const saved = parsed?.collections;
    if (!saved || typeof saved !== "object") {
      lastError = "Content file has no collections object.";
      return contentSnapshot();
    }

    for (const collection of COLLECTIONS) {
      const items = saved[collection.key];
      if (!Array.isArray(items)) continue;
      try {
        const normalized = normalizeItems(collection, items);
        collections.set(collection.key, normalized);
      } catch (error) {
        lastError = `${collection.label}: ${error.message}`;
        console.warn(`[content] skipped ${collection.key}: ${error.message}`);
      }
    }
    persisted = true;
  } catch (error) {
    if (error.code !== "ENOENT") {
      lastError = error.message;
      console.warn(`[content] could not load ${CONTENT_FILE}: ${error.message}`);
    }
    persisted = true;
  }

  return contentSnapshot();
}
