/**
 * SAME-ORIGIN POSTHOG INGEST FOR ASTRO SSR SITES (@astrojs/node).
 *
 * The nginx snippet in nginx/ingest.conf covers the statically-built sites, which
 * are served by an nginx container. Most of the fleet is not that: sixteen of the
 * twenty-four sites use the node adapter and serve from a Node process with no
 * nginx in front, so there is nowhere to put a location block. This is the same
 * proxy expressed as Astro middleware.
 *
 * WHY PROXY AT ALL, restated because it is the whole point: GA4's client id comes
 * from a cookie written by gtag.js loaded from googletagmanager.com, which content
 * blockers drop outright. Served from the site's own origin under /ingest,
 * PostHog's requests are indistinguishable from the site's own.
 *
 * Usage — a site with no other middleware:
 *
 *     // src/middleware.ts
 *     export { onRequest } from "@hamdevco/analytics/middleware";
 *
 * Usage — a site that already has middleware:
 *
 *     import { sequence } from "astro:middleware";
 *     import { ingestProxy } from "@hamdevco/analytics/middleware";
 *     export const onRequest = sequence(ingestProxy, myExistingMiddleware);
 *
 * Put ingestProxy FIRST. It answers /ingest/* itself and never calls next(), so
 * anything ahead of it in the sequence runs on every analytics beacon for no
 * reason — and anything that redirects, rewrites or authenticates could break the
 * request before it is proxied.
 */

/** The prefix the browser sends and PostHog must never see. */
const PREFIX = "/ingest";

/**
 * TWO UPSTREAMS, NOT ONE. us-assets serves the static bundles including the
 * session-replay recorder; us.i receives the events. Point both at the ingest
 * host and the recorder 404s, which disables replay while ordinary capture keeps
 * working — a partial failure that reads as "replay isn't switched on yet".
 */
const INGEST_ORIGIN = "https://us.i.posthog.com";
const ASSETS_ORIGIN = "https://us-assets.i.posthog.com";

/**
 * Hop-by-hop and identity headers that must not be forwarded upstream.
 * `host` in particular: forwarding the site's own Host to PostHog misroutes the
 * request. fetch() sets the correct one from the target URL once we omit it.
 */
const STRIP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "proxy-authorization",
  "proxy-authenticate",
  "te",
  "trailer",
]);

/**
 * `content-encoding` and `content-length` are dropped from the RESPONSE because
 * fetch has already decoded the body by the time we see it. Passing the original
 * encoding header on to a browser that then tries to decode again yields a
 * corrupt response that looks like a network error.
 */
const STRIP_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
]);

/**
 * Astro middleware that answers /ingest/* by proxying to PostHog.
 * Anything else is passed straight through to the next handler.
 */
export async function ingestProxy(context, next) {
  const url = new URL(context.request.url);

  if (url.pathname !== PREFIX && !url.pathname.startsWith(PREFIX + "/")) {
    return next();
  }

  // Route by path, then strip the prefix. The trailing slash is preserved
  // EXACTLY as the browser sent it — posthog-js POSTs to paths ending in a slash
  // via fetch(keepalive) and sendBeacon, and if anything answers those with a 3xx
  // to the slashless form, browsers drop the request body on the redirect hop.
  // Middleware returns the proxied response directly, so no redirect happens.
  const rest = url.pathname.slice(PREFIX.length) || "/";
  const isAsset = rest.startsWith("/static/");
  const target = new URL((isAsset ? ASSETS_ORIGIN : INGEST_ORIGIN) + rest);
  target.search = url.search;

  const headers = new Headers();
  for (const [k, v] of context.request.headers) {
    if (!STRIP_REQUEST_HEADERS.has(k.toLowerCase())) headers.set(k, v);
  }

  // WITHOUT THIS EVERY EVENT CARRIES THE SERVER'S IP.
  // PostHog derives country, region and city from the request address. Omit it
  // and every visitor resolves to whichever datacentre the container runs in —
  // the geo breakdown does not error, it just reports one city for the entire
  // client base. On sites whose whole value is local search, that is the
  // breakdown that matters most.
  const clientIp =
    context.clientAddress ||
    context.request.headers.get("x-forwarded-for") ||
    "";
  if (clientIp) {
    const existing = context.request.headers.get("x-forwarded-for");
    headers.set("x-forwarded-for", existing || clientIp);
  }
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""));

  const method = context.request.method;
  const hasBody = method !== "GET" && method !== "HEAD";

  let upstream;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body: hasBody ? context.request.body : undefined,
      // Node's fetch requires this whenever a streaming body is passed.
      ...(hasBody ? { duplex: "half" } : {}),
      redirect: "manual",
    });
  } catch (err) {
    // Analytics must never take the page down with it. A failed beacon is a lost
    // data point; a 500 from middleware would be a broken site.
    console.error("[analytics] ingest proxy failed:", err && err.message);
    return new Response(null, { status: 502 });
  }

  const responseHeaders = new Headers();
  for (const [k, v] of upstream.headers) {
    if (!STRIP_RESPONSE_HEADERS.has(k.toLowerCase())) responseHeaders.set(k, v);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

/** Convenience export for a site with no other middleware. */
export const onRequest = ingestProxy;
