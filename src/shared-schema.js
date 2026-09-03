/**
 * Events that mean the SAME thing on more than one kind of site, defined once.
 *
 * `Outbound Clicked` was originally content-only, on the assumption that leaving
 * for another domain is how an article earns. The same holds on a client site that sells elsewhere: with no phone number and few forms, the outbound click is its only conversion, and the client schema alone would leave it invisible.
 *
 * Defined here rather than copied into both schemas: two constants with the same
 * string is the exact failure this package exists to prevent — they drift, and a
 * breakdown silently splits in half.
 */

export const OUTBOUND_CLICKED = "Outbound Clicked";

/** Destination host, `www.` stripped, so example.com and www.example.com group as one. */
export const PROP_OUTBOUND_DOMAIN = "outbound_domain";
export const PROP_OUTBOUND_URL = "outbound_url";

/** Where on the page the link sat — a footer link is not an endorsement. */
export const PROP_LINK_REGION = "link_region";
export const REGION_BODY = "body";
export const REGION_NAV = "nav";
export const REGION_FOOTER = "footer";
export const REGION_SIDEBAR = "sidebar";

export const ALL_SHARED_EVENTS = [OUTBOUND_CLICKED];
export const ALL_SHARED_PROPS = [PROP_OUTBOUND_DOMAIN, PROP_OUTBOUND_URL, PROP_LINK_REGION];
export const ALL_LINK_REGIONS = [REGION_BODY, REGION_NAV, REGION_FOOTER, REGION_SIDEBAR];
