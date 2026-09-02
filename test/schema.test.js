import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "../src/schema.js";
import * as content from "../src/content-schema.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

/**
 * THE TEST THIS PACKAGE EXISTS TO MAKE POSSIBLE.
 *
 * A PostHog insight matches an event by NAME and breaks down by a PROPERTY NAME.
 * Nothing declares either — PostHog materialises whatever it is first sent — so
 * the only thing keeping the app and the insights in agreement is that both read
 * the same constant. A hand-typed literal anywhere else compiles, passes every
 * other test, and zeroes an insight in production with no error surfaced.
 *
 * The two schema modules are the only files allowed to contain these strings.
 */
const SCHEMA_FILES = new Set(["schema.js", "content-schema.js"]);
const files = readdirSync(SRC).filter((f) => f.endsWith(".js") && !SCHEMA_FILES.has(f));

/** Distinctive multi-word strings — safe to match as bare quoted literals. */
const distinctive = [
  ...schema.ALL_EVENTS,
  ...schema.ALL_SURFACES,
  ...content.ALL_CONTENT_EVENTS,
  ...content.ALL_LINK_REGIONS,
];

/**
 * Property keys are short common words — "client", "site", "niche". Matching them
 * as bare literals fires on ordinary prose in an error message, so they are
 * checked in KEY POSITION only, which is the thing that actually breaks a
 * breakdown: `{ client: x }` instead of `{ [PROP_CLIENT]: x }`.
 */
const propKeys = [...schema.ALL_PROPS, ...content.ALL_CONTENT_PROPS];

function stripNonCode(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

for (const file of files) {
  test(`${file} hard-codes no event name or enumerated value`, () => {
    const code = stripNonCode(readFileSync(join(SRC, file), "utf8"));
    for (const lit of distinctive) {
      for (const q of [`"${lit}"`, `'${lit}'`, `\`${lit}\``]) {
        assert.ok(
          !code.includes(q),
          `${file} hard-codes ${q}. Import it from a schema module instead — a ` +
          `literal here is how an insight silently starts reading zero.`
        );
      }
    }
  });

  test(`${file} uses no property key in literal key position`, () => {
    const code = stripNonCode(readFileSync(join(SRC, file), "utf8"));
    for (const key of propKeys) {
      const asKey = new RegExp(`(^|[{,\\s])["']?${key}["']?\\s*:`, "m");
      assert.ok(
        !asKey.test(code),
        `${file} uses "${key}" as a literal object key. Use the computed form ` +
        `[PROP_*] from a schema module — a literal key is invisible to a rename ` +
        `and leaves the breakdown reading an empty series.`
      );
    }
  });
}

test("every event name is unique within its schema", () => {
  assert.equal(new Set(schema.ALL_EVENTS).size, schema.ALL_EVENTS.length);
  assert.equal(new Set(content.ALL_CONTENT_EVENTS).size, content.ALL_CONTENT_EVENTS.length);
});

test("every property key is unique within its schema", () => {
  assert.equal(new Set(schema.ALL_PROPS).size, schema.ALL_PROPS.length);
  assert.equal(new Set(content.ALL_CONTENT_PROPS).size, content.ALL_CONTENT_PROPS.length);
});

test("custom event names are Title Case, matching PostHog's own convention", () => {
  for (const e of [...schema.ALL_EVENTS, ...content.ALL_CONTENT_EVENTS]) {
    assert.match(e, /^[A-Z][A-Za-z]*( [A-Z][A-Za-z]*)*$/, `"${e}" is not Title Case`);
  }
});

test("property keys are snake_case, so breakdowns read consistently", () => {
  for (const p of [...schema.ALL_PROPS, ...content.ALL_CONTENT_PROPS]) {
    assert.match(p, /^[a-z][a-z0-9_]*$/, `"${p}" is not snake_case`);
  }
});

test("the identifying property of each schema is present", () => {
  // Without these the shared project is one undifferentiated pile.
  assert.equal(schema.PROP_CLIENT, "client");
  assert.ok(schema.ALL_PROPS.includes(schema.PROP_CLIENT));
  assert.equal(content.PROP_SITE_SLUG, "site_slug");
  assert.ok(content.ALL_CONTENT_PROPS.includes(content.PROP_SITE_SLUG));
});

test("the two schemas share no event name", () => {
  // A shared name would merge a client funnel with a content funnel in whichever
  // project both landed in, and the merge would look like real data.
  const overlap = schema.ALL_EVENTS.filter((e) => content.ALL_CONTENT_EVENTS.includes(e));
  assert.deepEqual(overlap, [], `overlapping event names: ${overlap.join(", ")}`);
});

test("scroll thresholds are ascending and end at 100", () => {
  const d = content.DEPTH_THRESHOLDS;
  assert.deepEqual([...d].sort((a, b) => a - b), d);
  assert.equal(d[d.length - 1], 100);
});
