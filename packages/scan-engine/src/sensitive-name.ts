const SENSITIVE_QUERY_PARTS = new Set([
  "token",
  "secret",
  "password",
  "passwd",
  "credential",
  "credentials",
  "authorization",
  "auth",
  "signature",
  "sig",
  "jwt",
]);

const SENSITIVE_QUERY_COMPACT_NAMES = new Set([
  "key",
  "apikey",
  "xapikey",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "clientsecret",
  "apisecret",
  "privatekey",
  "subscriptionkey",
  "ocpapimsubscriptionkey",
  "xamzcredential",
  "xamzsignature",
  "xamzsecuritytoken",
  "xgoogcredential",
  "xgoogsignature",
  "xgoogalgorithm",
  "googleaccessid",
]);

export function isSensitiveQueryName(value: string): boolean {
  const separated = value.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const parts = separated
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const compact = parts.join("");
  return SENSITIVE_QUERY_COMPACT_NAMES.has(compact)
    || parts.some((part) => SENSITIVE_QUERY_PARTS.has(part));
}
