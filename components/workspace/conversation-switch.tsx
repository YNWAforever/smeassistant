import Link from "next/link";
import { copy, type PrototypeLocale } from "@/lib/copy";
import { conversationCopy } from "@/lib/copy-conversation";

/** Rendered only by the server-gated shell. Today remains the ordinary workspace root. */
export function ConversationSwitch({ locale, base, location, active }: { locale: PrototypeLocale; base: string; location: string; active: boolean }) {
  const t = conversationCopy[locale];
  return <nav className="conversation-switch" aria-label={t.switchLabel}>
    <Link href={`${base}?location=${encodeURIComponent(location)}`} aria-current={!active ? "page" : undefined}>{copy[locale].shell.nav.today}</Link>
    <Link href={`${base}/conversation?location=${encodeURIComponent(location)}`} aria-current={active ? "page" : undefined}>{t.switchLabel}<small>{t.preview}</small></Link>
  </nav>;
}
