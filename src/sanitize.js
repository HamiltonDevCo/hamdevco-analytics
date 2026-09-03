/**
 * Strip personal data out of URLs before anything is sent to PostHog.
 *
 * WHY THIS EXISTS. keestore.com redirects to its order page as
 * `/order/<id>?payment=success&email=<the customer's email>`. posthog-js records
 * `$current_url`, `$pathname` and `$referrer` on EVERY event, so that address was
 * being copied into analytics on the highest-intent page of a client's store —
 * with nothing erroring and no replay involved. Measured 2026-09-03.
 *
 * A checkout that puts an email, a token or a phone number in the URL is a normal
 * thing to do; it just must not follow the visitor into the analytics store. This
 * runs on every site rather than only the one where it was found, because the next
 * store to do it will not announce itself.
 */

/** Query parameters that carry a person. Matched case-insensitively. */
const PII_PARAMS = [
  "email", "e_mail", "mail", "phone", "tel", "name", "first_name", "last_name",
  "address", "token", "auth", "password", "secret", "session", "key", "signature",
];

const URL_PROPS = ["$current_url", "$referrer", "$pathname", "$initial_current_url", "$initial_referrer"];

/** Replace the VALUE of any PII parameter, keeping the shape of the URL intact. */
export function scrubUrl(value) {
  if (typeof value !== "string" || value.indexOf("?") === -1) return value;
  try {
    // Relative values (like $pathname) need a base to parse against; it is
    // discarded again below.
    const hasScheme = /^https?:\/\//i.test(value);
    const url = new URL(value, hasScheme ? undefined : "https://x.invalid");
    let touched = false;
    for (const key of [...url.searchParams.keys()]) {
      if (PII_PARAMS.some((p) => key.toLowerCase().includes(p))) {
        url.searchParams.set(key, "redacted");
        touched = true;
      }
    }
    if (!touched) return value;
    return hasScheme ? url.href : url.pathname + url.search + url.hash;
  } catch {
    // A URL we cannot parse is one we cannot clean — drop the query entirely
    // rather than pass it through on the assumption it is harmless.
    return value.split("?")[0];
  }
}

/**
 * posthog-js `sanitize_properties` hook. Runs on every event, before send.
 */
export function sanitizeProperties(properties) {
  if (!properties) return properties;
  for (const key of URL_PROPS) {
    if (properties[key]) properties[key] = scrubUrl(properties[key]);
  }
  return properties;
}
