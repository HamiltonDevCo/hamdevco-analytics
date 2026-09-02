/**
 * Declarations for the SSR ingest proxy. Typed structurally rather than against
 * `astro:middleware`, so the package does not need Astro as a dependency just to
 * describe its own shape.
 */

export interface IngestProxyContext {
  request: Request;
  clientAddress?: string;
}

export type IngestProxyNext = () => Promise<Response> | Response;

/**
 * Astro middleware that answers `/ingest/*` by proxying to PostHog and passes
 * everything else to `next()`.
 *
 * Sequence it FIRST. It answers `/ingest/*` itself and never calls `next()`, and
 * any middleware ahead of it that redirects a trailing slash will silently kill
 * every analytics beacon — browsers drop the request body on a redirect hop for
 * both `fetch(keepalive)` and `sendBeacon`.
 */
export function ingestProxy(
  context: IngestProxyContext,
  next: IngestProxyNext,
): Promise<Response>;

export const onRequest: typeof ingestProxy;
