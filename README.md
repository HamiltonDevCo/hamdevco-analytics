# @hamdevco/analytics

Shared PostHog instrumentation for the HamDevCo / BerryBloom site fleet — roughly
two dozen Astro sites, built into Docker images and deployed on Coolify.

One schema, one nginx snippet, one init call per site.

## Install

Consumed as a git dependency so Docker builds need no registry auth:

```json
{
  "dependencies": {
    "@hamdevco/analytics": "github:HamiltonDevCo/hamdevco-analytics#v0.1.0",
    "posthog-js": "^1.200.0"
  }
}
```

Pin the tag. `#main` will silently change what a site sends the next time its
image is rebuilt, which is the sort of drift that shows up as a funnel step
quietly reading zero three weeks later.

## Wire a site

**1. The nginx snippet.** Copy `nginx/ingest.conf` into the image and include it
from inside the `server { }` block:

```dockerfile
COPY node_modules/@hamdevco/analytics/nginx/ingest.conf /etc/nginx/snippets/ingest.conf
```

```nginx
server {
    # ...
    include /etc/nginx/snippets/ingest.conf;
}
```

> **It must not live in `/etc/nginx/conf.d/`.** The nginx base image already does
> `include /etc/nginx/conf.d/*.conf;` at *http* level, so a snippet placed there is
> loaded twice — once outside any `server` block, where `set` and `location` are
> illegal. nginx then refuses to start with
> `"set" directive is not allowed here`. Use `/etc/nginx/snippets/`.

**2. The init call**, once, in the site's base layout:

```astro
<script>
  import { initAnalytics } from "@hamdevco/analytics";
  initAnalytics({
    token: import.meta.env.PUBLIC_POSTHOG_KEY,
    client: "ccsmechanical",
  });
</script>
```

**3. The key must be a Docker BUILD ARG.** Not a Coolify runtime env var.

```dockerfile
ARG PUBLIC_POSTHOG_KEY
ENV PUBLIC_POSTHOG_KEY=$PUBLIC_POSTHOG_KEY
RUN npm run build
```

Vite replaces `import.meta.env.PUBLIC_POSTHOG_KEY` with a literal at build time.
A value injected at *runtime* bakes in as `undefined` no matter how correct the
Coolify env page looks, and `initAnalytics` then logs an error and sends nothing.
An empty project reads as "nobody visited the site", not "the key was missing" —
this is what HAM-962 turned out to be, three months after the fact.

## Wire an SSR site (@astrojs/node)

Sixteen of the twenty-four sites use the node adapter and serve from a Node
process with no nginx in front, so there is no location block to add. Same proxy,
expressed as middleware:

```ts
// src/middleware.ts — site with no other middleware
export { onRequest } from "@hamdevco/analytics/middleware";
```

```ts
// src/middleware.ts — site that already has middleware
import { sequence } from "astro:middleware";
import { ingestProxy } from "@hamdevco/analytics/middleware";

export const onRequest = sequence(ingestProxy, existingMiddleware);
```

> **`ingestProxy` MUST come first, and this is not a style preference.**
>
> KY Earthworks' middleware contains this, and several others in the fleet do too:
>
> ```ts
> if (path !== "/" && path.endsWith("/")) return context.redirect(clean, 301);
> ```
>
> `posthog-js` POSTs to `/ingest/e/`, `/ingest/i/v0/e/` and `/ingest/flags/` —
> every one of them trailing-slash — using `fetch(keepalive)` and
> `navigator.sendBeacon`. **Browsers drop the request body on a redirect hop for
> both of those send paths.** Ordered second, `ingestProxy` never sees the request
> and every event dies silently with a 301 that looks like a success in the logs.
>
> This is the same failure that meant Ridgerunner's session replay had never
> worked on any deploy. `ingestProxy` answers `/ingest/*` itself and never calls
> `next()`, so putting it first costs the rest of the chain nothing.

## What it sends

Six custom events plus autocapture. Deliberately small: for a trades or
local-service client the conversion is a phone call, so `Phone Clicked` and
`Form Submitted` are the money events and everything else is context.

| Event | Fired by |
|---|---|
| `Form Started` | first input in a `<form>`, once per form |
| `Form Submitted` | form submit |
| `Phone Clicked` | any `a[href^="tel:"]` |
| `Email Clicked` | any `a[href^="mailto:"]` |
| `Booking Started` / `Booking Completed` | called by the site |
| `Quote Requested` | called by the site |

Every event carries `client` and `site` as super properties. `client` is what
makes one shared PostHog project workable across the whole fleet — without it the
project is one undifferentiated pile.

Mark up a surface to get better breakdowns:

```html
<div data-ph-surface="hero"> … </div>
<form data-ph-form="quote"> … </form>
<input data-ph-mask>          <!-- excluded from session replay -->
```

## Rules this package exists to enforce

**Never type an event name or property key anywhere but `src/schema.js`.** PostHog
materialises whatever it is first sent; nothing declares an event name, so an
insight matching `Form Submitted` against an app now sending `Form Submit` reads
**zero, with no error anywhere**. `npm test` fails the build if any other file
hard-codes one.

**Verify a proxy with a browser, never with curl.** `posthog-js` POSTs to paths
ending in a slash via `fetch(keepalive)` and `navigator.sendBeacon`. If anything
in front answers those with a 3xx to the slashless form, browsers drop the request
body — and `curl -L` re-sends it and reports success. At Ridgerunner that meant
session replay had never worked on any deploy, and nothing reported a failure.

The acceptance test for a new site is: click through it in a real browser, then

```sql
SELECT event, properties.$host, timestamp FROM events
WHERE timestamp > now() - INTERVAL 5 MINUTE
```

**PostHog and GA4 will never agree.** `respect_dnt` is on, so a visitor sending
`DNT` or `Sec-GPC` produces no event at all; GA4 has no such check and counts them
in full. GA4 in turn loses everyone running a content blocker, which this proxy
does not. Neither loss is a random sample, so the ratio is not stable and cannot
be corrected with a multiplier. Compare PostHog to PostHog. Never put the two
side by side in a client report as though they measure the same thing.

## Test

```
npm test
```

Nine tests. The interesting ones assert that no file outside `schema.js`
hard-codes an event name, a surface value, or a property key in literal key
position.
