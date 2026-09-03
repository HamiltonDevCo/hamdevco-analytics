import posthog from "posthog-js";
import { sanitizeProperties } from "./sanitize.js";
import {
  OUTBOUND_CLICKED, PROP_OUTBOUND_DOMAIN, PROP_OUTBOUND_URL, PROP_LINK_REGION,
  regionOf,
} from "./shared-schema.js";
import {
  PROP_CLIENT, PROP_SITE, PROP_FORM_ID, PROP_SURFACE, PROP_PHONE, PROP_PROVIDER,
  FORM_STARTED, FORM_SUBMITTED, PHONE_CLICKED, EMAIL_CLICKED,
  BOOKING_STARTED, BOOKING_COMPLETED, QUOTE_REQUESTED,
  SURFACE_HEADER, SURFACE_FOOTER, SURFACE_HERO, SURFACE_BODY,
  SURFACE_STICKY, SURFACE_CONTACT_PAGE,
} from "./schema.js";

/**
 * BROWSER-SIDE INIT FOR EVERY SITE IN THE FLEET.
 *
 * THIS MODULE NEVER READS AN ENVIRONMENT VARIABLE. Config is passed in by the
 * caller, on purpose, and the reason is worth the paragraph:
 *
 * Vite replaces `import.meta.env.FOO` with a LITERAL at build time. In an Astro
 * app built into a Docker image, anything injected at RUNTIME — a Coolify service
 * env var, `docker run -e` — is baked in as `undefined` no matter how correct the
 * Coolify env page looks. If this package read its own key that way, `init` would
 * quietly no-op and the project would sit empty, which reads as "nobody visited
 * the site" rather than "the key was undefined".
 *
 * The same trap hits any secret read that way: a mailer that reads its credentials through `import.meta.env` takes its early return, and its notifications stop while the container logs nothing.
 *
 * So the site passes the key in, and the site is responsible for making sure it
 * is a Docker BUILD ARG. `initAnalytics` throws if it is missing rather than
 * returning quietly — a loud failure in the console beats a silent empty project.
 */

let started = false;

/**
 * @param {object} opts
 * @param {string} opts.token      PostHog project API key (phc_...). Public by design.
 * @param {string} opts.client     Client slug. Rides every event as a super property.
 * @param {string} [opts.apiHost]  Same-origin ingest path. Defaults to "/ingest".
 * @param {boolean} [opts.outbound] Track clicks that LEAVE the site as
 *   `Outbound Clicked`. Off by default — on most client sites an outbound click
 *   is someone leaving. On a site that sells elsewhere it is the ONLY conversion, and without this it is invisible.
 * @param {boolean} [opts.replay]  Enable session replay. Defaults to false.
 * @param {string} [opts.persistence]  posthog-js persistence mode. Defaults to
 *   "localStorage+cookie". Pass "localStorage" on any site whose privacy policy
 *   states it sets no cookies — the default DOES set a first-party cookie.
 * @param {boolean} [opts.debug]
 */
export function initAnalytics(opts) {
  if (typeof window === "undefined") return null;
  if (started) return posthog;

  const {
    token, client, apiHost = "/ingest", replay = false, debug = false,
    outbound = false,
    persistence = "localStorage+cookie",
  } = opts || {};

  // Loud, not quiet. See the note above about silent no-ops.
  if (!token || typeof token !== "string" || !token.startsWith("phc_")) {
    console.error(
      "[analytics] PostHog token missing or malformed. It must be a build-time " +
      "value (Docker ARG), not a runtime env var — a runtime var compiles to " +
      "undefined and this init would silently do nothing. Nothing was sent."
    );
    return null;
  }
  if (!client) {
    console.error(
      "[analytics] `client` slug is required. Every site in the shared project " +
      "identifies itself with it; without it the event lands unattributable and " +
      "no per-client insight can see it. Nothing was sent."
    );
    return null;
  }

  posthog.init(token, {
    api_host: apiHost,

    // "localStorage+cookie" is posthog-js's default and DOES set a first-party
    // cookie. Sites promising "no tracking cookies" must pass "localStorage".
    persistence,
    // Where the toolbar and "view in PostHog" links point. The proxy only carries
    // ingest; the UI still lives on the real host.
    ui_host: "https://us.posthog.com",

    // Marketing sites have no login, so almost every visitor is anonymous.
    // Anonymous events bill at a fraction of identified ones, and person profiles
    // we never look at are pure cost.
    person_profiles: "identified_only",

    // Honour Do Not Track. NOTE: posthog-js checks navigator.doNotTrack,
    // navigator.msDoNotTrack and window.doNotTrack ONLY — it does NOT read
    // Global Privacy Control (verified against posthog-js dist: zero occurrences
    // of globalPrivacyControl). Do not claim GPC support in a privacy policy.
    // This is still the main reason PostHog and GA4 will never agree: GA4 has no
    // such check and counts these visits in full. See the divergence note.
    respect_dnt: true,

    // "history_change", NOT true. With `true` posthog-js records the INITIAL
    // pageview only. That is fine on a static Astro site, where every navigation
    // is a fresh document — but on a Next.js app or a Turbo-driven site every navigation after the first is a pushState, and those pageviews would go uncounted.
    // Harmless on the MPA sites: no history change ever happens there.
    capture_pageview: "history_change",
    capture_pageleave: true,

    // Strip personal data out of URLs before anything leaves the browser.
    // A checkout that redirects to /order/<id>?email=<address> would copy that address into analytics, because posthog-js records $current_url on EVERY event. Applied everywhere, because a site that puts PII in a URL will not announce itself.
    sanitize_properties: sanitizeProperties,
    autocapture: true,

    // Uncaught JavaScript errors, reported as $exception events.
    //
    // A script that fails to parse leaves no trace in the page and no failed request, so a SyntaxError in a tag snippet can stop analytics loading for months with nothing surfacing it.
    //
    // With this on, that class of bug reports itself the first time a visitor
    // loads the page.
    capture_exceptions: true,

    disable_session_recording: !replay,
    session_recording: {
      // Mask anything typed. These are contact forms on client sites carrying real
      // names, phone numbers and addresses — there is no version of this where
      // recording keystrokes is acceptable.
      maskAllInputs: true,
      maskTextSelector: "[data-ph-mask]",
    },

    loaded: (ph) => {
      if (debug) ph.debug();
    },
  });

  // Super properties: attached to EVERY event including autocaptured ones, which
  // is what makes a single shared project workable across many sites.
  posthog.register({
    [PROP_CLIENT]: client,
    [PROP_SITE]: window.location.hostname,
  });

  started = true;
  wireAutoListeners(outbound);
  return posthog;
}

/* ------------------------------------------------------------------ *
 * Explicit capture helpers. Every one takes its event name and property
 * keys from schema.js — no literals below this line.
 * ------------------------------------------------------------------ */

function send(event, props) {
  if (!started) return;
  posthog.capture(event, props || {});
}

export const trackFormStarted   = (formId, surface) => send(FORM_STARTED,   { [PROP_FORM_ID]: formId, [PROP_SURFACE]: surface });
export const trackFormSubmitted = (formId, surface) => send(FORM_SUBMITTED, { [PROP_FORM_ID]: formId, [PROP_SURFACE]: surface });
export const trackPhoneClicked  = (number, surface) => send(PHONE_CLICKED,  { [PROP_PHONE]: digits(number), [PROP_SURFACE]: surface });
export const trackEmailClicked  = (surface)         => send(EMAIL_CLICKED,  { [PROP_SURFACE]: surface });
export const trackBookingStarted   = (provider) => send(BOOKING_STARTED,   { [PROP_PROVIDER]: provider });
export const trackBookingCompleted = (provider) => send(BOOKING_COMPLETED, { [PROP_PROVIDER]: provider });
export const trackQuoteRequested   = (formId)   => send(QUOTE_REQUESTED,   { [PROP_FORM_ID]: formId });

/** Digits only, so +1 (555) 010-0199 and 5550100199 group as one number. */
function digits(n) {
  return String(n || "").replace(/\D/g, "");
}

/* ------------------------------------------------------------------ *
 * Automatic listeners
 *
 * Phone taps and form submits are the two events that matter, and they are
 * the two most often forgotten when a site is built. Wiring them centrally
 * means a new page gets them for free — a per-page `onclick` would not.
 * ------------------------------------------------------------------ */

function wireAutoListeners(outbound) {
  // tel: and mailto: — delegated, so links rendered later still count.
  document.addEventListener("click", (e) => {
    const a = e.target && e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (href.startsWith("tel:")) {
      trackPhoneClicked(href.slice(4), surfaceOf(a));
    } else if (href.startsWith("mailto:")) {
      trackEmailClicked(surfaceOf(a));
    } else if (outbound) {
      // A click that LEAVES the site. On most client sites that is someone
      // wandering off; on one that sells elsewhere it IS the sale. Opt-in, so
      // the sites where it is noise do not fill up with it.
      let url;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return; // javascript:, #anchors and other non-navigational hrefs
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      if (url.hostname === window.location.hostname) return;
      send(OUTBOUND_CLICKED, {
        // `www.` stripped so example.com and www.example.com group as one
        // destination instead of splitting the report in half.
        [PROP_OUTBOUND_DOMAIN]: url.hostname.replace(/^www\./, ""),
        [PROP_OUTBOUND_URL]: url.href,
        [PROP_LINK_REGION]: regionOf(a),
      });
    }
  }, { capture: true });

  // Form engagement. `Form Started` fires once per form, on first input, so the
  // funnel can separate "saw the form" from "began filling it in" — which is
  // where these sites actually lose people.
  const seen = new WeakSet();
  document.addEventListener("input", (e) => {
    const form = e.target && e.target.closest && e.target.closest("form");
    if (!form || seen.has(form)) return;
    seen.add(form);
    trackFormStarted(formIdOf(form), surfaceOf(form));
  }, { capture: true });

  document.addEventListener("submit", (e) => {
    const form = e.target;
    if (!form || form.tagName !== "FORM") return;
    trackFormSubmitted(formIdOf(form), surfaceOf(form));
  }, { capture: true });
}

/** Prefers an explicit opt-in id, falls back to something stable. */
function formIdOf(form) {
  return form.getAttribute("data-ph-form") || form.getAttribute("id") || form.getAttribute("name") || "unnamed";
}

/**
 * Resolves the surface from an explicit `data-ph-surface` marker, then from the
 * nearest landmark. Returns an enumerated value from schema.js or SURFACE_BODY —
 * never an arbitrary string, because a breakdown charting a value the schema does
 * not know about is indistinguishable from a typo.
 */
function surfaceOf(el) {
  const marked = el.closest("[data-ph-surface]");
  if (marked) {
    const v = marked.getAttribute("data-ph-surface");
    if ([SURFACE_HEADER, SURFACE_FOOTER, SURFACE_HERO, SURFACE_BODY, SURFACE_STICKY, SURFACE_CONTACT_PAGE].includes(v)) return v;
  }
  if (el.closest("header, [role=banner]")) return SURFACE_HEADER;
  if (el.closest("footer, [role=contentinfo]")) return SURFACE_FOOTER;
  return SURFACE_BODY;
}

export { posthog };
