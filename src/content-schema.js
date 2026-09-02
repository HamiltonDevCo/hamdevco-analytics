/**
 * EVENT NAMES AND PROPERTY KEYS FOR THE CONTENT NETWORK. Separate from schema.js
 * on purpose — these two answer different questions and must not drift into each
 * other.
 *
 * WHY A SECOND SCHEMA AT ALL. schema.js assumes the conversion is a phone call or
 * a form submit, which is right for a trades client and meaningless on a content
 * site. Measured on the first four content sites deployed by mistake against the
 * client schema: they recorded `$pageview` and `$pageleave` and NOTHING else — not
 * one of the six client conversion events, because these pages carry no phone
 * number and no form. A shared schema would have left the whole network reporting
 * traffic and no outcome.
 *
 * WHAT ACTUALLY MATTERS HERE. The link marketplace was retired (selling do-follow
 * links passes PageRank and violates Google's link-spam policy); the 30 sites
 * monetise through content and affiliate instead. So the money event is the
 * OUTBOUND CLICK to a merchant, and everything else exists to explain why it did
 * or did not happen.
 *
 * THE SAME RULE APPLIES AS IN schema.js: PostHog materialises whatever it is first
 * sent and nothing declares these names anywhere, so a literal typed elsewhere
 * reads as ZERO on an insight with no error. Import from here; never retype.
 */

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

/** The money event. An affiliate or merchant link followed off-site. */
export const OUTBOUND_CLICKED = "Outbound Clicked";

/**
 * Fired once per threshold per page at 25/50/75/100%.
 *
 * Four events rather than one "scroll depth" number because a funnel needs
 * discrete steps to measure drop-off between them, and a max-depth property on
 * pageleave cannot be funnelled.
 */
export const SCROLL_DEPTH = "Scroll Depth";

/**
 * Reached the end AND stayed long enough to plausibly have read it.
 *
 * Depth alone is not readership: a bounce that flings the scrollbar to the bottom
 * hits 100% in under a second. This is the event that separates traffic from
 * attention, which is the only thing that makes a niche worth feeding.
 */
export const READ_COMPLETED = "Read Completed";

/** A click to another page on the same site — how well the network cross-links. */
export const INTERNAL_LINK_CLICKED = "Internal Link Clicked";

export const ALL_CONTENT_EVENTS = [
  OUTBOUND_CLICKED,
  SCROLL_DEPTH,
  READ_COMPLETED,
  INTERNAL_LINK_CLICKED,
];

/* ------------------------------------------------------------------ *
 * Property keys
 * ------------------------------------------------------------------ */

/** The site slug — `gotobourbon`, `seonose`. Rides every event as a super property. */
export const PROP_SITE_SLUG = "site_slug";

/** The niche cluster, so 30 sites roll up into a handful of readable groups. */
export const PROP_NICHE = "niche";

/**
 * The destination host of an outbound click, e.g. `amazon.com`.
 *
 * THE SINGLE MOST USEFUL PROPERTY IN THIS SCHEMA. Grouped across the network it
 * answers which merchants the content actually sends people to, which is the
 * input to any affiliate decision.
 */
export const PROP_OUTBOUND_DOMAIN = "outbound_domain";

/** Full destination URL. Kept alongside the domain for spot-checking a placement. */
export const PROP_OUTBOUND_URL = "outbound_url";

/** 25 | 50 | 75 | 100. Integer, not a string, so it sorts and filters numerically. */
export const PROP_DEPTH_PCT = "depth_pct";

/** Seconds on the page when the event fired. */
export const PROP_ENGAGED_SECONDS = "engaged_seconds";

/** Whether the link sat in the body copy or in nav/header/footer furniture. */
export const PROP_LINK_REGION = "link_region";

export const ALL_CONTENT_PROPS = [
  PROP_SITE_SLUG,
  PROP_NICHE,
  PROP_OUTBOUND_DOMAIN,
  PROP_OUTBOUND_URL,
  PROP_DEPTH_PCT,
  PROP_ENGAGED_SECONDS,
  PROP_LINK_REGION,
];

/* ------------------------------------------------------------------ *
 * Enumerated values
 * ------------------------------------------------------------------ */

/** In the article body — an editorial link, the kind that earns affiliate revenue. */
export const REGION_BODY = "body";
/** Site furniture. A high outbound rate from here is navigation, not endorsement. */
export const REGION_NAV = "nav";
export const REGION_FOOTER = "footer";
export const REGION_SIDEBAR = "sidebar";

export const ALL_LINK_REGIONS = [REGION_BODY, REGION_NAV, REGION_FOOTER, REGION_SIDEBAR];

/** The scroll thresholds, in order. Used by the client and by the funnel config. */
export const DEPTH_THRESHOLDS = [25, 50, 75, 100];

/**
 * Seconds a visitor must have been on the page before READ_COMPLETED can fire.
 * Below this, reaching the bottom is a scroll-fling, not a read.
 */
export const READ_MIN_SECONDS = 15;
