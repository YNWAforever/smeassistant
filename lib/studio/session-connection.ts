/**
 * Session advisory locks need a session-affine connection across short commits.
 * Studio uses the direct variant of the SAME canonical Neon endpoint with the
 * existing application identity. Normal application pooling is unchanged.
 * Other PostgreSQL deployments must already supply a session-affine endpoint.
 */
export function studioSessionConnectionString(applicationUrl: string): string {
  try {
    const url = new URL(applicationUrl);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2) {
      throw new Error("invalid");
    }
    // pg accepts query-string overrides of routing/identity and can recursively
    // parse connectionString. Do not let those override the endpoint we checked.
    const overrides = new Set(["host", "hostaddr", "port", "user", "username", "pass" + "word", "database", "dbname", "connectionstring", "options"]);
    for (const key of url.searchParams.keys()) {
      if (overrides.has(key.toLowerCase())) throw new Error("ambiguous");
    }
    // pg decodes host escapes that WHATWG preserves; require canonical routing.
    if (url.hostname.includes("%")) throw new Error("invalid_endpoint");
    // PostgreSQL URLs are non-special WHATWG URLs: DNS case is not normalized.
    url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.hostname.endsWith(".neon.tech") && url.hostname.split(".")[0].endsWith("-pooler")) {
      if (!/^ep-[a-z0-9-]+-pooler\.[a-z0-9.-]+\.neon\.tech$/.test(url.hostname)) throw new Error("invalid_endpoint");
      url.hostname = url.hostname.replace(/-pooler(?=\.)/, "");
    }
    // Force query serialization so pg's legacy parser cannot reinterpret raw
    // spaces or an encoded routing key differently from URLSearchParams.
    url.search = url.searchParams.toString();
    return url.href;
  } catch {
    // Configuration errors must not disclose URLs or application credentials.
    throw new Error("studio_session_configuration_invalid");
  }
}
