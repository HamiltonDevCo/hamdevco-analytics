/**
 * Event names and property keys for AUTHENTICATED products — Stowlane, SEO Knows,
 * Buds Produce, and the KeeStore / WCSC partner portals.
 *
 * Separate from schema.js because the question is different. A marketing site asks
 * "did this visitor convert?" — a phone tap, a form submit. A logged-in product asks
 * "did this user activate, come back, and use the thing?". Firing `Form Submitted`
 * inside an app would land those in the same funnel as a contact form and make both
 * meaningless.
 *
 * These are DELIBERATELY disjoint from schema.js and content-schema.js; a test
 * asserts no event name appears in more than one, because a collision would merge
 * two unrelated funnels and the merge would look like real data.
 *
 * PostHog materialises whatever it is first sent. Nothing declares these anywhere
 * else, so a name typed differently reads as ZERO with no error surfaced.
 */

export const APP_EVENTS = {
  SIGNED_IN: "Signed In",
  SIGNED_OUT: "Signed Out",
  ACCOUNT_CREATED: "Account Created",
  FEATURE_USED: "Feature Used",
  RECORD_CREATED: "Record Created",
  SEARCH_PERFORMED: "Search Performed",
  ERROR_SHOWN: "Error Shown",
};

export const APP_PROPS = {
  APP: "app",
  OWNER: "owner",
  ROLE: "role",
  FEATURE: "feature",
  AREA: "area",
  RECORD_TYPE: "record_type",
  RESULT_COUNT: "result_count",
  ERROR_CODE: "error_code",
  QUERY_LENGTH: "query_length",
};

/**
 * Who the product belongs to. Rides every event so one project can hold both our
 * own products and a client's portal without the two being confused in a rollup.
 */
export const OWNERS = ["hamdevco", "client"];

/** Flat lists, matching schema.js and content-schema.js, so the tests can sweep them. */
export const ALL_APP_EVENTS = Object.values(APP_EVENTS);
export const ALL_APP_PROPS = Object.values(APP_PROPS);

/** The property that makes one shared project readable. Without it, apps are a pile. */
export const PROP_APP = APP_PROPS.APP;
