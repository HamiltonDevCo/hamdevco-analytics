import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "../src/schema.js";
import * as content from "../src/content-schema.js";
import * as appSchema from "../src/app-schema.js";

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
const SCHEMA_FILES = new Set(["schema.js", "content-schema.js", "app-schema.js",
                             "shared-schema.js"]);
const files = readdirSync(SRC).filter((f) => f.endsWith(".js") && !SCHEMA_FILES.has(f));

/** Distinctive multi-word strings — safe to match as bare quoted literals. */
const distinctive = [
  ...schema.ALL_EVENTS,
  ...schema.ALL_SURFACES,
  ...content.ALL_CONTENT_EVENTS,
  ...content.ALL_LINK_REGIONS,
  ...appSchema.ALL_APP_EVENTS,
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
  assert.equal(new Set(appSchema.ALL_APP_EVENTS).size, appSchema.ALL_APP_EVENTS.length);
});

test("every property key is unique within its schema", () => {
  assert.equal(new Set(schema.ALL_PROPS).size, schema.ALL_PROPS.length);
  assert.equal(new Set(content.ALL_CONTENT_PROPS).size, content.ALL_CONTENT_PROPS.length);
  assert.equal(new Set(appSchema.ALL_APP_PROPS).size, appSchema.ALL_APP_PROPS.length);
});

test("custom event names are Title Case, matching PostHog's own convention", () => {
  for (const e of [...schema.ALL_EVENTS, ...content.ALL_CONTENT_EVENTS, ...appSchema.ALL_APP_EVENTS]) {
    assert.match(e, /^[A-Z][A-Za-z]*( [A-Z][A-Za-z]*)*$/, `"${e}" is not Title Case`);
  }
});

test("property keys are snake_case, so breakdowns read consistently", () => {
  for (const p of [...schema.ALL_PROPS, ...content.ALL_CONTENT_PROPS, ...appSchema.ALL_APP_PROPS]) {
    assert.match(p, /^[a-z][a-z0-9_]*$/, `"${p}" is not snake_case`);
  }
});

test("the identifying property of each schema is present", () => {
  // Without these the shared project is one undifferentiated pile.
  assert.equal(schema.PROP_CLIENT, "client");
  assert.ok(schema.ALL_PROPS.includes(schema.PROP_CLIENT));
  assert.equal(content.PROP_SITE_SLUG, "site_slug");
  assert.ok(content.ALL_CONTENT_PROPS.includes(content.PROP_SITE_SLUG));
  assert.equal(appSchema.PROP_APP, "app");
  assert.ok(appSchema.ALL_APP_PROPS.includes(appSchema.PROP_APP));
});

test("no two schemas share an event name", () => {
  // A shared name would merge unrelated funnels in whichever project both landed
  // in, and the merge would look like real data. App events land in the SAME two
  // projects as the marketing events, so this matters more now, not less.
  const sets = {
    client: schema.ALL_EVENTS,
    content: content.ALL_CONTENT_EVENTS,
    app: appSchema.ALL_APP_EVENTS,
  };
  const names = Object.keys(sets);
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const overlap = sets[names[i]].filter((e) => sets[names[j]].includes(e));
      assert.deepEqual(overlap, [],
        `${names[i]} and ${names[j]} share: ${overlap.join(", ")}`);
    }
  }
});

test("scroll thresholds are ascending and end at 100", () => {
  const d = content.DEPTH_THRESHOLDS;
  assert.deepEqual([...d].sort((a, b) => a - b), d);
  assert.equal(d[d.length - 1], 100);
});

/**
 * THE BUG THIS CATCHES ACTUALLY SHIPPED, briefly.
 *
 * A refactor added an outbound-click branch to client.js that called `regionOf(a)`
 * and read `outbound`, while the edit that was supposed to DECLARE both silently
 * matched nothing. The result compiled, minified, passed every other test, and
 * emitted `else if(outbound){…regionOf(t)…}` with two undeclared globals — which
 * throws a ReferenceError on the first link click and takes `Phone Clicked` and
 * `Email Clicked` down with it. `node --check` does not catch it: the syntax is
 * perfectly valid.
 *
 * So: every function these modules call must be declared or imported in the same
 * file. Crude, but it is exactly the failure mode that got through.
 */
for (const file of readdirSync(SRC).filter((f) => f.endsWith(".js"))) {
  test(`${file} calls no undeclared function`, () => {
    const src = readFileSync(join(SRC, file), "utf8");
    // Strip comments AND string literals first: an English sentence inside an
    // error message ("value (Docker ARG), not a runtime env var") reads as a
    // function call to a naive scan, and a check that cries wolf gets ignored.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      .replace(/`(?:\\.|[^`\\])*`/g, "``")
      .replace(/"(?:\\.|[^"\\])*"/g, '""')
      .replace(/'(?:\\.|[^'\\])*'/g, "''");

    const declared = new Set([
      ...[...code.matchAll(/function\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]),
      ...[...code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)].map((m) => m[1]),
      ...[...code.matchAll(/import\s*\{([^}]+)\}/g)].flatMap((m) =>
        m[1].split(",").map((x) => x.trim().split(/\s+as\s+/).pop())),
      ...[...code.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from/g)].map((m) => m[1]),
      // destructured locals, e.g. const { token, client } = opts
      ...[...code.matchAll(/\{([^{}]+)\}\s*=\s*(?:opts|e|data)/g)].flatMap((m) =>
        m[1].split(",").map((x) => x.trim().split("=")[0].trim())),
      // FUNCTION PARAMETERS. `next` in middleware.js and `outbound` in client.js
      // are parameters, not globals — without these the check cries wolf on
      // perfectly correct code, and a check that cries wolf gets ignored.
      ...[...code.matchAll(/function\s*[A-Za-z_$\w]*\s*\(([^)]*)\)/g)].flatMap((m) =>
        m[1].split(",").map((x) => x.trim().split(/[=:]/)[0].replace(/[{}.\s]/g, "").trim())),
      ...[...code.matchAll(/\(([^()]*)\)\s*=>/g)].flatMap((m) =>
        m[1].split(",").map((x) => x.trim().split(/[=:]/)[0].replace(/[{}.\s]/g, "").trim())),
      ...[...code.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)].map((m) => m[1]),
    ].filter(Boolean));

    const BUILTIN = new Set(["require","String","Number","Boolean","Object","Array","Date",
      "Math","JSON","URL","Set","Map","WeakSet","WeakMap","Promise","Error","parseInt",
      "parseFloat","isNaN","encodeURIComponent","decodeURIComponent","setTimeout",
      "clearTimeout","setInterval","fetch","MutationObserver","Headers","Request","Response",
      "if","for","while","switch","catch","return","typeof","function","new","await","super"]);

    const called = new Set(
      [...code.matchAll(/(?:^|[^.\w$])([a-z][\w$]*)\s*\(/g)].map((m) => m[1]));

    const missing = [...called].filter(
      (n) => !declared.has(n) && !BUILTIN.has(n));

    assert.deepEqual(missing, [],
      `${file} calls ${missing.join(", ")} but neither declares nor imports it — ` +
      `that is a ReferenceError at runtime, not a build error.`);
  });
}
