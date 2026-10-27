#!/usr/bin/env node
/**
 * THIS REPOSITORY IS PUBLIC. This check fails when a file — or a commit message
 * piped in on stdin — names a client, a product or a person, cites an internal
 * ticket, gives a calendar date, or uses a real domain or phone number. The rule
 * and its reasons are in AGENTS.md.
 *
 * Names are checked against SHA-256 hashes in protected-names.json, never against
 * a plain list: a plain list of client names in a public repo is the leak itself.
 * Findings print the file, the line and the rule — never the matched text, because
 * a CI log on a public repo is public too.
 *
 *   node scripts/public-check.mjs                 scan every tracked file
 *   git log --format=%B A..B | node scripts/public-check.mjs --stdin
 *   node scripts/public-check.mjs --hash "Name"   print the hash to protect a name
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

/** Lower-case, letters and digits only — "Acme Widgets" and "acme-widgets" hash alike. */
export const normalise = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
export const hashName = (s) => createHash("sha256").update(normalise(s)).digest("hex");

const PROTECTED = new Set(JSON.parse(readFileSync(join(HERE, "protected-names.json"), "utf8")));

/** Names are matched as runs of up to four adjacent words, so a spaced name is caught. */
const MAX_WORDS = 4;

/** Domains that may appear: vendors this package talks to, and reserved examples. */
const ALLOWED_DOMAINS = [
  "posthog.com", "example.com", "googletagmanager.com", "github.com", "claude.com", "anthropic.com",
];
// Hostnames ending in one of these TLDs, written in lower case, are treated as real domains.
const DOMAIN = /\b(?:[a-z0-9-]+\.)+(?:com|io|net|org|app|co|dev|ai|shop|us|biz|info|site|store)\b/g;
// Property access that looks like a domain: `opts.app`, `opts.site`.
const NOT_A_DOMAIN = /^(opts|this|data|props|config)\.[a-z]+$/;

const RULES = [
  { id: "ticket-id", re: /\b(?!SHA-|ISO-|RFC-)[A-Z][A-Z0-9]{1,5}-\d{2,6}\b/ },
  { id: "calendar-date", re: /\b20\d\d-[01]\d-[0-3]\d\b/ },
  { id: "phone-number", re: /\(\d{3}\)\s?\d{3}-\d{4}/, unless: /\(555\)/ },
  { id: "incident-narrative", re: /\b(measured\s+(at|on)|verified\s+on|caught\s+on|bitten\s+by|post-?mortem)\b/i },
  { id: "email-address", re: /[\w.+-]+@([\w-]+\.)+[a-z]{2,}/i, unless: /@(example\.com|anthropic\.com)\b/i },
];

function allowedDomain(host) {
  if (NOT_A_DOMAIN.test(host)) return true;
  if (/^[a-z]\.[a-z]+$/.test(host)) return true; // single-letter test fixtures: s.com, k.com
  return ALLOWED_DOMAINS.some((d) => host === d || host.endsWith("." + d));
}

/** Returns [{ line, rule }] for one text. Never returns the matched text. */
export function findIssues(text, { protectedHashes = PROTECTED } = {}) {
  const issues = [];
  text.split("\n").forEach((raw, i) => {
    const line = i + 1;
    for (const r of RULES) {
      if (r.re.test(raw) && !(r.unless && r.unless.test(raw))) issues.push({ line, rule: r.id });
    }
    // %40 is an encoded @: jo%40example.com is a mailbox at example.com.
    for (const m of raw.replace(/%40/g, "@").matchAll(DOMAIN)) {
      if (!allowedDomain(m[0])) { issues.push({ line, rule: "real-domain" }); break; }
    }
    const words = raw.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    outer: for (let a = 0; a < words.length; a++) {
      let run = "";
      for (let n = 0; n < MAX_WORDS && a + n < words.length; n++) {
        run += words[a + n];
        if (protectedHashes.has(createHash("sha256").update(run).digest("hex"))) {
          issues.push({ line, rule: "protected-name" });
          break outer;
        }
      }
    }
  });
  return issues;
}

/** Every tracked file, except the hash list itself. */
export function scanRepo() {
  const files = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
    .split("\n").filter((f) => f && f !== "scripts/protected-names.json");
  const out = [];
  for (const f of files) {
    for (const { line, rule } of findIssues(readFileSync(join(ROOT, f), "utf8"))) {
      out.push(`${f}:${line} ${rule}`);
    }
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let found;
  if (args[0] === "--hash") {
    console.log(hashName(args.slice(1).join(" ")));
    process.exit(0);
  } else if (args[0] === "--stdin") {
    found = findIssues(readFileSync(0, "utf8")).map(({ line, rule }) => `stdin:${line} ${rule}`);
  } else {
    found = scanRepo();
  }
  if (found.length) {
    console.error(found.join("\n"));
    console.error(`\n${found.length} finding(s). This repo is public — see AGENTS.md.`);
    process.exit(1);
  }
}
