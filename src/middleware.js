import { isIngestPath, proxyToPostHog } from "./proxy-core.js";

/**
 * SAME-ORIGIN POSTHOG INGEST FOR ASTRO SSR SITES (@astrojs/node).
 *
 * Pair this with the catch-all route in src/pages/ingest/[...path].ts. Both are
 * required and they do different jobs — see the comment at the top of
 * proxy-core.js. Short version: the route makes /ingest reachable at all, the
 * middleware makes it reachable BEFORE the site's CSRF, auth and
 * trailing-slash-redirect middleware get a chance to kill the beacon.
 *
 * Usage — a site with no other middleware:
 *
 *     export { onRequest } from "@hamdevco/analytics/middleware";
 *
 * Usage — a site that already has middleware:
 *
 *     import { sequence } from "astro:middleware";
 *     import { ingestProxy } from "@hamdevco/analytics/middleware";
 *     export const onRequest = sequence(ingestProxy, existingMiddleware);
 *
 * ingestProxy goes FIRST. It answers /ingest/* itself and never calls next(),
 * so nothing ahead of it in the chain has any reason to run.
 */
export async function ingestProxy(context, next) {
  const url = new URL(context.request.url);
  if (!isIngestPath(url.pathname)) return next();
  return proxyToPostHog(context.request, context.clientAddress);
}

/** Convenience export for a site with no other middleware. */
export const onRequest = ingestProxy;
