/**
 * Events that mean the SAME thing on more than one kind of site, defined once.
 *
 * `Outbound Clicked` was originally content-only, on the assumption that leaving
 * for another domain is how an article earns. That assumption turned out to hold
 * on a client site too: krausen.io has no phone number and one form across 25
 * pages, and sells its courses by sending people to Udemy. Measured 2026-09-03 —
 * it was the busiest client site in the project and its only conversion was
 * invisible, because the client schema had no event for it.
 *
 * Defined here rather than copied into both schemas: two constants with the same
 * string is the exact failure this package exists to prevent — they drift, and a
 * breakdown silently splits in half.
 */

export const OUTBOUND_CLICKED = "Outbound Clicked";

/** Destination host, `www.` stripped, so amazon.com and www.amazon.com group as one. */
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

/**
 * Which region of the page a link sits in, as one of the enumerated values above.
 *
 * Lives here, beside the values it returns, so the client and content schemas
 * cannot end up classifying the same link differently — a footer link counted as
 * body on one site and footer on another makes the breakdown meaningless.
 */
export function regionOf(el) {
  if (el.closest("nav, header, [role=navigation], [role=banner]")) return REGION_NAV;
  if (el.closest("footer, [role=contentinfo]")) return REGION_FOOTER;
  if (el.closest("aside, [role=complementary]")) return REGION_SIDEBAR;
  return REGION_BODY;
}
