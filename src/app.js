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
 * @param {boolean} [opts.replay] Session replay. Defaults to FALSE — on a client's
 *   portal this would record their users, which their privacy policy has not
 *   agreed to. Only opt in for a product we own.
 */
export function initAppAnalytics(opts) {
  if (typeof window === "undefined") return null;
  if (started) return posthog;

  const { token, app, owner, client, apiHost = "/ingest", replay = false } = opts || {};

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

    // Uncaught JavaScript errors, reported as $exception events.
    //
    // THIS IS THE CHECK THAT WAS MISSING. The 30 content sites carried a
    // doubled-brace SyntaxError in their GTM snippet from 2026-04-21 to
    // 2026-09-02 — four and a half months of GA4 and GTM never loading — and
    // nothing surfaced it, because a script that fails to parse leaves no trace
    // in the page and no failed request. It was found only by reading
    // Runtime.exceptionThrown over CDP, by hand.
    //
    // With this on, that class of bug reports itself the first time a visitor
    // loads the page.
    capture_exceptions: true,

    // Replay is OFF unless a caller opts in. These are authenticated screens
    // holding customer records — on a client's portal they are that client's
    // users, and their privacy policy has not agreed to this. Stowlane is our
    // own product, which is why it opts in and the partner portals do not.
    disable_session_recording: !replay,
      session_recording: {
        // Mask anything typed. These are contact forms and checkouts carrying real
        // names, phone numbers, addresses and card details — there is no version
        // of this where recording keystrokes is acceptable.
        maskAllInputs: true,

        // INPUTS ARE NOT THE WHOLE PROBLEM. An order confirmation or an account
        // page renders the customer's name and address as ORDINARY TEXT, which
        // maskAllInputs does not touch. `address` is the real HTML element for a
        // postal address; the data attributes are the convention for anything
        // else. Mark PII on a store's confirmation and account pages with
        // data-ph-mask, or replay will record it in the clear.
        maskTextSelector: "[data-ph-mask], [data-ph-no-capture], address",
      },

    loaded: () => {
      const supers = {
        [APP_PROPS.APP]: app,
        [APP_PROPS.OWNER]: owner,
        [PROP_SITE]: window.location.hostname,
      };
      if (client) supers.client = client;
      posthog.register(supers);
      adoptCurrentUser();
      adoptCurrentGroup();
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
 * Reads a `current-group` meta tag and associates the session with an account.
 *
 * WHY THIS EXISTS. Without it PostHog can tell you A USER did something but not
 * WHICH ACCOUNT — so "which storage operator actually uses this" and "which
 * partners have gone quiet" are unanswerable, and those are the questions a B2B
 * product is judged on. Every later event carries the group automatically.
 *
 * Name only. No billing detail, no contact, nothing that turns the analytics
 * store into a second CRM.
 */
export function identifyGroup({ type, key, name } = {}) {
  if (!started || !type || key == null) return;
  posthog.group(String(type), String(key), name ? { name } : undefined);
}

function adoptCurrentGroup() {
  const meta = document.querySelector('meta[name="current-group"]');
  if (!meta) return;
  let data;
  try {
    data = JSON.parse(meta.getAttribute("content") || "{}");
  } catch {
    return;
  }
  if (!data || !data.type || data.key == null) return;
  posthog.group(String(data.type), String(data.key),
                data.name ? { name: data.name } : undefined);
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
