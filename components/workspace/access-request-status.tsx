import { copy, type PrototypeLocale } from "@/lib/copy"
import type { MyRequestStatus } from "@/lib/workspace/my-access-request"

/**
 * DEC-06 says not to claim an operating service exists, so this promises no
 * review, no response time and no "our team is looking at this". It states
 * what is recorded and nothing more.
 */
export function AccessRequestStatus({
  status,
  locale,
  businessName,
}: {
  status: MyRequestStatus
  locale: PrototypeLocale
  businessName: string
}) {
  const t = copy[locale].accessRequest.status
  return (
    <div className="section-card">
      <p className="eyebrow">{t.eyebrow}</p>
      <h2>{businessName}</h2>
      <p>{t[status]}</p>
    </div>
  )
}
