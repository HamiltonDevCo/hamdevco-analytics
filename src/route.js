import { proxyToPostHog } from "./proxy-core.js";

/**
 * Catch-all Astro route for /ingest/[...path].
 *
 * WHY A ROUTE AND NOT JUST MIDDLEWARE. The @astrojs/node adapter serves a
 * PRERENDERED 404.astro for unmatched paths BEFORE middleware runs, so on a site
 * with a prerendered 404 the ingest middleware never sees the request and every
 * /ingest path returns the site's 404 page. Registering a real route makes the
 * path match, which puts the request through the SSR pipeline — where the
 * middleware then answers it first.
 *
 * Use in a site as:
 *
 *     // src/pages/ingest/[...path].ts
 *     export { ALL, prerender } from "@hamdevco/analytics/route";
 */

/** Must be false, or this route is baked to a static file at build time. */
export const prerender = false;

/** One handler for every method: posthog-js uses GET, POST and OPTIONS. */
export const ALL = ({ request, clientAddress }) =>
  proxyToPostHog(request, clientAddress);
