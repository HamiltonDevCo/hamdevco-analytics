/**
 * The actual proxying, shared by the middleware and the catch-all route.
 *
 * Two entry points exist because neither is sufficient alone:
 *
 *   - The MIDDLEWARE has to exist so the proxy runs BEFORE any CSRF, auth or
 *     trailing-slash-redirect middleware the site already has. posthog-js beacons
 *     carry no CSRF token and no session, and browsers drop the request body on a
 *     redirect hop, so anything ahead of the proxy in the chain silently kills
 *     every event.
 *
 *   - The ROUTE has to exist because the @astrojs/node adapter serves a
 *     PRERENDERED 404.astro for unmatched paths BEFORE middleware runs at all.
 *     bryan-krausen documents this in its own astro.config.mjs, having been bitten
 *     by it once already. Without a route registered at /ingest/[...path], the
 *     middleware never sees the request and every ingest path 404s.
 *
 * So the route makes the path reachable and the middleware makes it reachable
 * FIRST. On a site with both, the middleware answers and the route body never
 * runs — that is fine and intended.
 */

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
 * `host` must not be forwarded: sending the site's own Host to PostHog misroutes
 * the request. fetch() sets the right one from the target URL once we omit it.
 * The rest are hop-by-hop headers that must not cross a proxy boundary.
 */
const STRIP_REQUEST_HEADERS = new Set([
  "host", "connection", "keep-alive", "transfer-encoding", "upgrade",
  "proxy-authorization", "proxy-authenticate", "te", "trailer",
]);

/**
 * fetch has already decoded the body by the time we see it, so passing the
 * original content-encoding on to a browser that decodes again yields a corrupt
 * response that presents as a network error.
 */
const STRIP_RESPONSE_HEADERS = new Set([
  "content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive",
]);

/** True when this request is one the proxy should answer. */
export function isIngestPath(pathname) {
  return pathname === PREFIX || pathname.startsWith(PREFIX + "/");
}

/**
 * Proxy one request to PostHog and return its response.
 * @param {Request} request
 * @param {string} [clientAddress] Astro's resolved client IP, when available.
 */
export async function proxyToPostHog(request, clientAddress) {
  const url = new URL(request.url);

  // The trailing slash is preserved EXACTLY as the browser sent it. posthog-js
  // POSTs to paths ending in a slash via fetch(keepalive) and sendBeacon, and a
  // 3xx to the slashless form makes browsers drop the body on the redirect hop.
  const rest = url.pathname.slice(PREFIX.length) || "/";
  // PostHog's documented proxy routes BOTH /static/ and /array/ to the asset
  // host. posthog-js currently fetches its bundle from /static/array.js, but a
  // config that asks for /array/<token>/array.js would otherwise hit the ingest
  // host and 404 — which disables analytics silently, with no console error.
  const isAsset = rest.startsWith("/static/") || rest.startsWith("/array/");
  const target = new URL((isAsset ? ASSETS_ORIGIN : INGEST_ORIGIN) + rest);
  target.search = url.search;

  const headers = new Headers();
  for (const [k, v] of request.headers) {
    if (!STRIP_REQUEST_HEADERS.has(k.toLowerCase())) headers.set(k, v);
  }

  // WITHOUT THIS EVERY EVENT CARRIES THE SERVER'S IP. PostHog derives country,
  // region and city from the request address, so omitting it does not error —
  // it reports one datacentre city for the entire client base. On sites whose
  // whole value is local search, that is the breakdown that matters most.
  const existing = request.headers.get("x-forwarded-for");
  const ip = existing || clientAddress || "";
  if (ip) headers.set("x-forwarded-for", ip);
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""));

  const method = request.method;
  const hasBody = method !== "GET" && method !== "HEAD";

  let upstream;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body: hasBody ? request.body : undefined,
      // Node's fetch requires this whenever a streaming body is passed.
      ...(hasBody ? { duplex: "half" } : {}),
      redirect: "manual",
    });
  } catch (err) {
    // Analytics must never take the page down with it. A failed beacon is a lost
    // data point; a thrown middleware is a broken site.
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
