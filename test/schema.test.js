import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "../src/schema.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

/**
 * THE TEST THIS PACKAGE EXISTS TO MAKE POSSIBLE.
 *
 * A PostHog funnel matches an event by NAME and breaks down by a PROPERTY NAME.
 * Nothing declares either, so the only thing keeping the app and the insights in
 * agreement is that both read the same constant. A hand-typed literal anywhere
 * else compiles, passes every other test, and zeroes a funnel step in production
 * with no error surfaced anywhere.
 *
 * So: every file under src/ EXCEPT schema.js must be free of these literals.
 */
const files = readdirSync(SRC).filter((f) => f.endsWith(".js") && f !== "schema.js");

/**
 * Event names and surface values are distinctive multi-word strings, so a bare
 * quoted-literal check is precise for them.
 */
const distinctive = [...schema.ALL_EVENTS, ...schema.ALL_SURFACES];

/**
 * Property keys are short common words — "client", "site". Searching for them as
 * bare literals fires on ordinary prose in an error message, so they are checked
 * in KEY POSITION only, which is the thing that actually breaks a breakdown:
 * `{ client: x }` or `{ "client": x }` instead of `{ [PROP_CLIENT]: x }`.
 */
const propKeys = [...schema.ALL_PROPS];

function stripNonCode(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

for (const file of files) {
  test(`${file} hard-codes no event name or surface value`, () => {
    const code = stripNonCode(readFileSync(join(SRC, file), "utf8"));
    for (const lit of distinctive) {
      for (const q of [`"${lit}"`, `'${lit}'`, `\`${lit}\``]) {
        assert.ok(
          !code.includes(q),
          `${file} hard-codes ${q}. Import it from schema.js instead — a literal ` +
          `here is how a funnel step silently starts reading zero.`
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
        `[PROP_*] from schema.js — a literal key is invisible to a rename and ` +
        `leaves the breakdown reading an empty series.`
      );
    }
  });
}

test("every event name is unique", () => {
  assert.equal(new Set(schema.ALL_EVENTS).size, schema.ALL_EVENTS.length);
});

test("every property key is unique", () => {
  assert.equal(new Set(schema.ALL_PROPS).size, schema.ALL_PROPS.length);
});

test("custom event names are Title Case, matching PostHog's own convention", () => {
  for (const e of schema.ALL_EVENTS) {
    assert.match(e, /^[A-Z][A-Za-z]*( [A-Z][A-Za-z]*)*$/, `"${e}" is not Title Case`);
  }
});

test("property keys are snake_case, so breakdowns read consistently", () => {
  for (const p of schema.ALL_PROPS) {
    assert.match(p, /^[a-z][a-z0-9_]*$/, `"${p}" is not snake_case`);
  }
});

test("the client property is present — the shared-project topology depends on it", () => {
  assert.equal(schema.PROP_CLIENT, "client");
  assert.ok(schema.ALL_PROPS.includes(schema.PROP_CLIENT));
});
