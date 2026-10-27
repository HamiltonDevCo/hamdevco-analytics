import { test } from "node:test";
import assert from "node:assert/strict";
import { findIssues, hashName, scanRepo } from "../scripts/public-check.mjs";

/**
 * THIS REPOSITORY IS PUBLIC. See AGENTS.md. This fails the build when any tracked
 * file names a client, a product or a person, or narrates an incident.
 */
test("no tracked file exposes a client, a product or an incident", () => {
  assert.deepEqual(scanRepo(), []);
});

test("a protected name is caught in any spelling", () => {
  const hashes = new Set([hashName("Acme Widgets")]);
  for (const s of ["Acme Widgets", "acme-widgets", "AcmeWidgets", "the acme_widgets site"]) {
    assert.deepEqual(findIssues(s, { protectedHashes: hashes }).map((i) => i.rule), ["protected-name"], s);
  }
  assert.deepEqual(findIssues("acme and widgets", { protectedHashes: hashes }), []);
});

// Each bad sample is split in two, so this file passes the scan of its own repo.
test("tickets, dates, domains, phone numbers and incident phrasing are caught", () => {
  const none = { protectedHashes: new Set() };
  const rule = (s) => findIssues(s, none).map((i) => i.rule);
  assert.deepEqual(rule("fixed in ABC" + "-123"), ["ticket-id"]);
  assert.deepEqual(rule("broke on 2025-" + "01-31"), ["calendar-date"]);
  assert.deepEqual(rule("see shop.acmewidgets" + ".io"), ["real-domain"]);
  assert.deepEqual(rule("call (502) 123" + "-4567"), ["phone-number"]);
  assert.deepEqual(rule("Measured" + " at the store"), ["incident-narrative"]);
  assert.deepEqual(rule("mail jo@acmewidgets" + ".io"), ["email-address", "real-domain"]);

  // Allowed: reserved examples, vendor hosts, property access, SHA-256.
  assert.deepEqual(rule("https://shop.example.com/a?email=jo%40example.com"), []);
  assert.deepEqual(rule('ui_host: "https://us.posthog.com"'), []);
  assert.deepEqual(rule("opts.app and opts.site, SHA-256, (555) 010-0199"), []);
});
