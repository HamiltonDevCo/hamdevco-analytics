/**
 * Hand-written declarations. The package ships plain ESM with no build step, so
 * these are the only types consumers get — a site running `tsc --noEmit` in CI
 * fails on TS7016 without them.
 */

export const PAGEVIEW: "$pageview";
export const FORM_STARTED: "Form Started";
export const FORM_SUBMITTED: "Form Submitted";
export const PHONE_CLICKED: "Phone Clicked";
export const EMAIL_CLICKED: "Email Clicked";
export const BOOKING_STARTED: "Booking Started";
export const BOOKING_COMPLETED: "Booking Completed";
export const QUOTE_REQUESTED: "Quote Requested";
export const ALL_EVENTS: readonly string[];

export const PROP_CLIENT: "client";
export const PROP_SITE: "site";
export const PROP_FORM_ID: "form_id";
export const PROP_SURFACE: "surface";
export const PROP_PHONE: "phone_number";
export const PROP_PROVIDER: "provider";
export const ALL_PROPS: readonly string[];

export const SURFACE_HEADER: "header";
export const SURFACE_FOOTER: "footer";
export const SURFACE_HERO: "hero";
export const SURFACE_BODY: "body";
export const SURFACE_STICKY: "sticky_bar";
export const SURFACE_CONTACT_PAGE: "contact_page";
export const ALL_SURFACES: readonly string[];

export type Surface =
  | "header"
  | "footer"
  | "hero"
  | "body"
  | "sticky_bar"
  | "contact_page";

export interface AnalyticsOptions {
  /** PostHog project API key (phc_...). Public by design. */
  token: string;
  /** Client slug. Rides every event as a super property. */
  client: string;
  /** Same-origin ingest path. Defaults to "/ingest". */
  apiHost?: string;
  /** Enable session replay. Defaults to false. */
  replay?: boolean;
  debug?: boolean;
}

/**
 * Returns the posthog instance, or null when it refused to start — a missing or
 * malformed token, or a missing client slug. It logs an error in that case and
 * sends nothing; it never throws.
 */
export function initAnalytics(opts: AnalyticsOptions): typeof posthog | null;

export function trackFormStarted(formId: string, surface?: Surface): void;
export function trackFormSubmitted(formId: string, surface?: Surface): void;
export function trackPhoneClicked(num: string, surface?: Surface): void;
export function trackEmailClicked(surface?: Surface): void;
export function trackBookingStarted(provider: string): void;
export function trackBookingCompleted(provider: string): void;
export function trackQuoteRequested(formId: string): void;

import type posthog from "posthog-js";
export { posthog };
