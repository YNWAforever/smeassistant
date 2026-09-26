import Link from "next/link"

/** Unlisted operator tooling (English by the recorded /ops exception). */
export function OpsNav({ locale, current }: { locale: string; current: "failures" | "access-requests" }) {
  const links = [
    { key: "failures", href: `/${locale}/ops/failures`, label: "Failures" },
    { key: "access-requests", href: `/${locale}/ops/access-requests`, label: "Access requests" },
  ] as const
  return (
    <nav aria-label="Operator tools" className="flex gap-4">
      {links.map((link) => (
        <Link key={link.key} href={link.href} aria-current={link.key === current ? "page" : undefined}>
          {link.label}
        </Link>
      ))}
    </nav>
  )
}
