/**
 * Publishing an approved review reply to Google Business Profile (P4.6, spec
 * §2.1) is off by default. Only the exact string "true" turns it on: "TRUE",
 * "1" or a padded value stay off.
 */
export function gbpReplyPublishEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.GBP_REPLY_PUBLISH_ENABLED === "true";
}

/**
 * Publishing an approved version to a connected Instagram professional account
 * (P20.2) is off by default. Only the exact string "true" turns it on: "TRUE",
 * "1" or a padded value stay off. It is a separate flag from
 * INSTAGRAM_OAUTH_ENABLED so connecting an account never implies permission to
 * post, and from the insights flag so neither implies the other.
 */
export function instagramPublishEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.INSTAGRAM_PUBLISH_ENABLED === "true";
}

/**
 * Reading the connected account's Instagram insights (P20.3) is off by
 * default and is a separate flag from publishing: reading platform metrics
 * never implies permission to post, and posting never implies permission to
 * read insights. Only the exact string "true" turns it on.
 */
export function instagramInsightsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.INSTAGRAM_INSIGHTS_ENABLED === "true";
}
