import posthog from "posthog-js";
import { sanitizeProperties } from "./sanitize.js";
import {
  OUTBOUND_CLICKED, SCROLL_DEPTH, READ_COMPLETED, INTERNAL_LINK_CLICKED,
  PROP_SITE_SLUG, PROP_NICHE, PROP_OUTBOUND_DOMAIN, PROP_OUTBOUND_URL,
  PROP_DEPTH_PCT, PROP_ENGAGED_SECONDS, PROP_LINK_REGION,
  REGION_BODY, REGION_NAV, REGION_FOOTER, REGION_SIDEBAR,
  DEPTH_THRESHOLDS, READ_MIN_SECONDS,
} from "./content-schema.js";
// One definition, shared with the client schema.
import { regionOf } from "./shared-schema.js";

/**
 * BROWSER-SIDE INIT FOR THE CONTENT NETWORK — the 30 owned niche sites.
 *
 * Deliberately NOT initAnalytics from client.js. That one wires phone and form
 * listeners, which fire on nothing here, and sends the client event schema, which
 * would leave the whole network reporting traffic and no outcome.
 *
 * Config is passed in and never read from the environment, for the same reason as
 * client.js: Vite inlines `import.meta.env` at BUILD time, so a value injected at
 * container start compiles to `undefined` and init silently no-ops.
 */

let started = false;

/**
 * @param {object} opts
 * @param {string} opts.token  PostHog project API key (phc_...). Public by design.
 * @param {string} opts.site   Site slug, e.g. "gotobourbon".
 * @param {string} [opts.niche] Cluster name, so 30 sites roll up into a few groups.
 * @param {string} [opts.apiHost] Same-origin ingest path. Defaults to "/ingest".
 * @param {boolean} [opts.debug]
 */
export function initContentAnalytics(opts) {
  if (typeof window === "undefined") return null;
  if (started) return posthog;

  const { token, site, niche = "unclassified", apiHost = "/ingest", debug = false } = opts || {};

  // Loud, never quiet — a silent return here is indistinguishable from no traffic.
  if (!token || typeof token !== "string" || !token.startsWith("phc_")) {
    console.error(
      "[analytics] PostHog token missing or malformed. It must be a build-time " +
      "literal, not a runtime env var — a runtime var compiles to undefined and " +
      "this init would silently do nothing. Nothing was sent."
    );
    return null;
  }
  if (!site) {
    console.error(
      "[analytics] `site` slug is required. One project holds the whole network, " +
      "so an event without it is unattributable. Nothing was sent."
    );
    return null;
  }

  posthog.init(token, {
    api_host: apiHost,
    ui_host: "https://us.posthog.com",
    person_profiles: "identified_only",
    respect_dnt: true,
    capture_pageview: true,
    capture_pageleave: true,

    // Strip personal data out of URLs before anything leaves the browser.
    // posthog-js records $current_url on EVERY event, and a checkout that puts
    // an email in the query string then copies it into analytics.
    sanitize_properties: sanitizeProperties,
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
    disable_session_recording: true,
  });

  posthog.register({
    [PROP_SITE_SLUG]: site,
    [PROP_NICHE]: niche,
  });

  started = true;
  wireContentListeners();
  if (debug) posthog.debug();
  return posthog;
}

function send(event, props) {
  if (!started) return;
  posthog.capture(event, props || {});
}

/* ------------------------------------------------------------------ *
 * Listeners
 * ------------------------------------------------------------------ */

function wireContentListeners() {
  const startedAt = Date.now();
  const seconds = () => Math.round((Date.now() - startedAt) / 1000);

  // ---- outbound and internal link clicks, delegated so late DOM still counts.
  document.addEventListener("click", (e) => {
    const a = e.target && e.target.closest && e.target.closest("a[href]");
    if (!a) return;

    let url;
    try {
      url = new URL(a.getAttribute("href"), window.location.href);
    } catch {
      return; // mailto:, tel:, javascript: and other non-navigational hrefs
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return;

    if (url.hostname === window.location.hostname) {
      send(INTERNAL_LINK_CLICKED, { [PROP_LINK_REGION]: regionOf(a) });
      return;
    }

    send(OUTBOUND_CLICKED, {
      // Bare registrable host — `www.` stripped so amazon.com and www.amazon.com
      // group as one merchant instead of splitting the report in half.
      [PROP_OUTBOUND_DOMAIN]: url.hostname.replace(/^www\./, ""),
      [PROP_OUTBOUND_URL]: url.href,
      [PROP_LINK_REGION]: regionOf(a),
      [PROP_ENGAGED_SECONDS]: seconds(),
    });
  }, { capture: true });

  // ---- scroll depth, once per threshold per page.
  const hit = new Set();
  let ticking = false;

  const check = () => {
    ticking = false;
    const doc = document.documentElement;
    const scrollable = doc.scrollHeight - window.innerHeight;

    // A page shorter than the viewport is fully visible on load. Reporting 100%
    // for it would inflate every depth number in the network with pages nobody
    // scrolled, so it is recorded once and the listener stops.
    if (scrollable <= 0) {
      if (!hit.has(100)) {
        hit.add(100);
        send(SCROLL_DEPTH, { [PROP_DEPTH_PCT]: 100, [PROP_ENGAGED_SECONDS]: seconds() });
      }
      return;
    }

    const pct = ((window.scrollY || doc.scrollTop) / scrollable) * 100;
    for (const t of DEPTH_THRESHOLDS) {
      if (pct >= t && !hit.has(t)) {
        hit.add(t);
        send(SCROLL_DEPTH, { [PROP_DEPTH_PCT]: t, [PROP_ENGAGED_SECONDS]: seconds() });
      }
    }

    // Depth alone is not readership — a bounce can fling the scrollbar to the
    // bottom in under a second. READ_MIN_SECONDS is what separates the two.
    if (hit.has(100) && !hit.has("read") && seconds() >= READ_MIN_SECONDS) {
      hit.add("read");
      send(READ_COMPLETED, { [PROP_ENGAGED_SECONDS]: seconds() });
    }
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(check);
  };

  window.addEventListener("scroll", onScroll, { passive: true });

  // Someone can reach the bottom quickly and then sit and read. Without this the
  // read event never fires for them, because nothing scrolls again.
  window.addEventListener("pagehide", check);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") check();
  });

  check(); // short pages, and anything restored mid-page
}

export { posthog };
