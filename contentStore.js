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

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CONTENT_FILE = path.join(
  here,
  "data",
  "default-content.json",
);
export const CONTENT_FILE =
  process.env.CONTENT_FILE || path.join(here, "data", "content.json");
const MEMORY_ONLY = CONTENT_FILE === ":memory:";

export class ContentValidationError extends Error {
  constructor(details) {
    super("Some content entries are invalid.");
    this.name = "ContentValidationError";
    this.code = "invalid_content";
    this.details = details;
  }
}

export const COLLECTIONS = [
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
];

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

for (const collection of COLLECTIONS) {
  try {
    DEFAULT_ITEMS[collection.key] = normalizeItems(
      collection,
      DEFAULT_ITEMS[collection.key],
    );
  } catch (error) {
    const details = Array.isArray(error?.details)
      ? error.details.join(" ")
      : error.message;
    throw new Error(
      `Invalid default content for ${collection.key}: ${details}`,
    );
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
  const payload = {
    updatedAt: new Date().toISOString(),
    collections: Object.fromEntries(
      COLLECTIONS.map((collection) => [
        collection.key,
        getCollection(collection.key),
      ]),
    ),
  };

  try {
    await fs.mkdir(path.dirname(CONTENT_FILE), { recursive: true });
    const temporary = `${CONTENT_FILE}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    try {
      await fs.rename(temporary, CONTENT_FILE);
    } catch {
      await fs.writeFile(CONTENT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      await fs.rm(temporary, { force: true });
    }
    persisted = true;
    lastError = "";
  } catch (error) {
    persisted = false;
    lastError = error.message;
    console.warn(`[content] could not save ${CONTENT_FILE}: ${error.message}`);
  }
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
