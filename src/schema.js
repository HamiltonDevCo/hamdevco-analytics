/**
 * THE SINGLE SOURCE OF TRUTH FOR EVERY EVENT NAME AND PROPERTY KEY.
 *
 * WHY THIS FILE EXISTS. PostHog materialises whatever it is first sent. Nothing
 * declares an event name or a property key anywhere — not in the project, not in
 * the API. So a funnel step matching "Form Submitted" against an app that now
 * sends "Form Submit" is a coincidence maintained by hand, and when it breaks the
 * step reads ZERO with no error, no warning, and no failed request.
 *
 * At Ridgerunner this rule was first applied to event NAMES only, which left the
 * property keys and the `surface` values as hand-typed strings. Renaming any one
 * of them typechecked, passed the entire test suite, and silently zeroed step one
 * of two funnels. Hence: names, property keys AND enumerated values all live here,
 * and every consumer imports them. Nothing downstream types a literal.
 *
 * IF YOU RENAME ANYTHING IN THIS FILE you are renaming it in PostHog too. The old
 * name's history does not follow it. Add a new constant instead, and retire the
 * old one once its insights are rebuilt.
 */

/* ------------------------------------------------------------------ *
 * Events
 *
 * Deliberately small. For a trades or local-service client the conversion
 * is a phone call, not a purchase — so the money events here are the phone
 * tap and the form submit, and everything else is context for those two.
 * Resist adding an event until an insight actually needs it: unused custom
 * events cost the same as used ones and make the schema harder to trust.
 * ------------------------------------------------------------------ */

/** Autocaptured by posthog-js. Named here so insights can import it too. */
export const PAGEVIEW = "$pageview";

/** First real interaction with a form — focus or first keystroke, fired once. */
export const FORM_STARTED = "Form Started";

/** The form actually submitted. One of the two money events. */
export const FORM_SUBMITTED = "Form Submitted";

/** A tel: link tapped or clicked. The other money event, and the one GA4 is worst at. */
export const PHONE_CLICKED = "Phone Clicked";

/** A mailto: link followed. */
export const EMAIL_CLICKED = "Email Clicked";

/** A booking widget opened (GHL calendar embed, Calendly, etc). */
export const BOOKING_STARTED = "Booking Started";

/** A booking confirmed. Fired from the confirmation surface, not the click. */
export const BOOKING_COMPLETED = "Booking Completed";

/** An explicit quote/estimate request, where that is distinct from a contact form. */
export const QUOTE_REQUESTED = "Quote Requested";

/** Every custom event this package will ever send. Used by the config tooling. */
export const ALL_EVENTS = [
  FORM_STARTED,
  FORM_SUBMITTED,
  PHONE_CLICKED,
  EMAIL_CLICKED,
  BOOKING_STARTED,
  BOOKING_COMPLETED,
  QUOTE_REQUESTED,
];

/* ------------------------------------------------------------------ *
 * Property keys
 * ------------------------------------------------------------------ */

/**
 * The client slug — `ccsmechanical`, `kyearthworks`.
 *
 * THIS IS THE KEY THE WHOLE SHARED-PROJECT TOPOLOGY RESTS ON. Every site in the
 * Client Sites project sends it as a SUPER property, so it rides on every event
 * including autocaptured ones. Without it the project is one undifferentiated
 * pile and no per-client insight is possible. It is validated at init.
 */
export const PROP_CLIENT = "client";

/** The host the event came from. Distinguishes apex from www, and staging from prod. */
export const PROP_SITE = "site";

/** A stable id for the form — `contact`, `quote`, `newsletter`. */
export const PROP_FORM_ID = "form_id";

/** Where on the page the interaction happened. Values are enumerated below. */
export const PROP_SURFACE = "surface";

/** The tel: number as dialled, digits only, so it groups across formatting. */
export const PROP_PHONE = "phone_number";

/** For booking events: which provider rendered the widget. */
export const PROP_PROVIDER = "provider";

export const ALL_PROPS = [
  PROP_CLIENT,
  PROP_SITE,
  PROP_FORM_ID,
  PROP_SURFACE,
  PROP_PHONE,
  PROP_PROVIDER,
];

/* ------------------------------------------------------------------ *
 * Enumerated values
 *
 * These are as load-bearing as the names. A funnel that breaks down by
 * `surface` and charts "header" is reading a literal that must match what
 * the site sends, so the site must not type it either.
 * ------------------------------------------------------------------ */

export const SURFACE_HEADER = "header";
export const SURFACE_FOOTER = "footer";
export const SURFACE_HERO = "hero";
export const SURFACE_BODY = "body";
export const SURFACE_STICKY = "sticky_bar";
export const SURFACE_CONTACT_PAGE = "contact_page";

export const ALL_SURFACES = [
  SURFACE_HEADER,
  SURFACE_FOOTER,
  SURFACE_HERO,
  SURFACE_BODY,
  SURFACE_STICKY,
  SURFACE_CONTACT_PAGE,
];
