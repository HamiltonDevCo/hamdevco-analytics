import posthog from "posthog-js";
import { APP_EVENTS, APP_PROPS } from "./app-schema.js";
// `site` is defined in schema.js, not here — one definition, so a rename
// cannot leave two schemas disagreeing about the same breakdown.
import { PROP_SITE } from "./schema.js";

/**
 * PostHog for an AUTHENTICATED product.
 *
 * WHAT THIS DOES NOT DO. It does not send the user's email address. Rails layouts
 * in this estate expose `<meta name="current-user" content='{"id":…,"email":…}'>`,
 * and it would be one line to forward that — but an analytics store is the wrong
 * place for a customer list, and on a CLIENT's portal it is their users' PII, not
 * ours to copy. Only the opaque id and the role are sent.
 */

let started = false;
let identified = false;

/**
 * @param {object} opts
 * @param {string} opts.token   PostHog project API key (phc_...). Public by design.
 * @param {string} opts.app     Product slug, e.g. "stowlane". Rides every event.
 * @param {string} opts.owner   "hamdevco" or "client" — who the product belongs to.
 * @param {string} [opts.client] Client slug, when owner is "client", so the events
 *   join that client's rollup alongside their marketing site.
 * @param {string} [opts.apiHost] Same-origin ingest path. Defaults to "/ingest".
 */
export function initAppAnalytics(opts) {
  if (typeof window === "undefined") return null;
  if (started) return posthog;

  const { token, app, owner, client, apiHost = "/ingest" } = opts || {};

  // Loud, not quiet: a silent no-op here is indistinguishable from a product
  // nobody uses.
  if (!token || typeof token !== "string" || !token.startsWith("phc_")) {
    console.error("[analytics] PostHog token missing or malformed. Nothing was sent.");
    return null;
  }
  if (!app || !owner) {
    console.error("[analytics] `app` and `owner` are required. Nothing was sent.");
    return null;
  }

  posthog.init(token, {
    api_host: apiHost,
    ui_host: "https://us.posthog.com",

    // These users log in, so they ARE identified — but staying on identified_only
    // means the logged-out marketing pages of the same app do not mint a profile
    // for every anonymous visitor.
    person_profiles: "identified_only",

    // Do Not Track only. posthog-js does NOT read Global Privacy Control.
    respect_dnt: true,

    // Products route client-side. With `true` only the first screen of a session
    // would ever be recorded.
    capture_pageview: "history_change",
    capture_pageleave: true,
    autocapture: true,

    // Replay is off until it is a deliberate, disclosed decision. These are
    // authenticated screens holding customer records — on a client's portal they
    // are that client's users, and their privacy policy has not agreed to this.
    disable_session_recording: true,

    loaded: () => {
      const supers = {
        [APP_PROPS.APP]: app,
        [APP_PROPS.OWNER]: owner,
        [PROP_SITE]: window.location.hostname,
      };
      if (client) supers.client = client;
      posthog.register(supers);
      adoptCurrentUser();
      wireErrors();
    },
  });

  started = true;
  return posthog;
}

/**
 * Reads the `current-user` meta tag the Rails layouts already render. Deliberately
 * takes ONLY the opaque id and the role — never the email.
 */
function adoptCurrentUser() {
  const meta = document.querySelector('meta[name="current-user"]');
  if (!meta) return;
  let data;
  try {
    data = JSON.parse(meta.getAttribute("content") || "{}");
  } catch {
    return;
  }
  if (data && data.id != null) {
    identifyUser({ id: data.id, role: data.role_type || data.role });
  }
}

/**
 * Call from the app when a user signs in, if there is no `current-user` meta tag.
 * Safe to call repeatedly — `Signed In` fires once per page load, not per call.
 */
export function identifyUser({ id, role } = {}) {
  if (!started || id == null) return;
  posthog.identify(String(id), role ? { [APP_PROPS.ROLE]: role } : undefined);
  if (!identified) {
    identified = true;
    posthog.capture(APP_EVENTS.SIGNED_IN, role ? { [APP_PROPS.ROLE]: role } : {});
  }
}

/** Call on sign-out so the next user on a shared machine is not merged into this one. */
export function signOut() {
  if (!started) return;
  posthog.capture(APP_EVENTS.SIGNED_OUT);
  posthog.reset();
  identified = false;
}

/**
 * Flash messages and validation errors are the cheapest signal a product gives you
 * about where people get stuck, and no app reports them anywhere. Read from the
 * elements the Rails/Next layouts already render; capped so a render loop cannot
 * flood ingest.
 */
function wireErrors() {
  const SELECTOR = '[role="alert"], .alert-danger, .alert-error, .flash-error, [data-error]';
  let sent = 0;

  const report = (el) => {
    if (sent >= 5 || !el || !el.textContent) return;
    const text = el.textContent.trim().slice(0, 120);
    if (!text) return;
    sent += 1;
    posthog.capture(APP_EVENTS.ERROR_SHOWN, {
      [APP_PROPS.ERROR_CODE]: text,
      [APP_PROPS.AREA]: window.location.pathname,
    });
  };

  document.querySelectorAll(SELECTOR).forEach(report);

  new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches && n.matches(SELECTOR)) report(n);
        else if (n.querySelectorAll) n.querySelectorAll(SELECTOR).forEach(report);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}
