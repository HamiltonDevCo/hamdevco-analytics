/** Content-network instrumentation. See content-schema.js for why this is separate. */
export interface ContentAnalyticsOptions {
  /** PostHog project API key (phc_...). Public by design. */
  token: string;
  /** Site slug, e.g. "gotobourbon". */
  site: string;
  /** Niche cluster, so 30 sites roll up into a few readable groups. */
  niche?: string;
  apiHost?: string;
  debug?: boolean;
}

/** Returns the posthog instance, or null when it refused to start. Never throws. */
export function initContentAnalytics(
  opts: ContentAnalyticsOptions,
): typeof posthog | null;

import type posthog from "posthog-js";
export { posthog };
