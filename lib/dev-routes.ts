/** Internal routes such as /dev/design-system exist only outside production builds. */
export function devRoutesEnabled(env: string | undefined = process.env.NODE_ENV): boolean {
  return env !== "production"
}
