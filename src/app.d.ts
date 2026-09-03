/** Authenticated-product instrumentation. See app-schema.js for why this is separate. */
export interface AppAnalyticsOptions {
  /** PostHog project API key (phc_...). Public by design. */
  token: string;
  /** Product slug, e.g. "stowlane". Rides every event as a super property. */
  app: string;
  /** Who the product belongs to. */
  owner: "hamdevco" | "client";
  /**
   * Client slug when `owner` is "client", so the product's events join that
   * client's rollup alongside their marketing site.
   */
  client?: string;
  apiHost?: string;
  /**
   * Session replay. Defaults to false. Only opt in for a product we own — on a
   * client's portal this records their users, which their privacy policy has
   * not agreed to.
   */
  replay?: boolean;
}

/** Returns the posthog instance, or null when it refused to start. Never throws. */
export function initAppAnalytics(opts: AppAnalyticsOptions): typeof posthog | null;

/**
 * Identify the signed-in user. Pass the OPAQUE ID ONLY — never an email address.
 * Safe to call repeatedly; `Signed In` fires once per page load, not per call.
 */
export function identifyUser(user: { id: string | number; role?: string }): void;

/**
 * Associate the session with an account, so events answer "which account" and not
 * only "which user". Reads a `current-group` meta tag automatically; call this
 * directly if the app has no such tag.
 */
export function identifyGroup(group: { type: string; key: string | number; name?: string }): void;

/** Capture `Signed Out` and reset, so the next user on a shared machine is separate. */
export function signOut(): void;

import type posthog from "posthog-js";
export { posthog };
