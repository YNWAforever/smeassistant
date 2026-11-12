import { Sparkles } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"

/**
 * The single owner entry into Kinnso. It replaces the old contextual assistant
 * sheet on owner surfaces; the chat keeps the action/location context in the URL
 * and the server maps the allowlisted `ask` key to a starter message. It never
 * carries free text, so a link cannot smuggle an arbitrary prompt.
 */
export function AskKinnsoLink({
  locale,
  workspaceSlug,
  location,
  label,
  actionId,
  versionId,
  ask,
  className,
  variant = "outline",
  size = "sm",
  disabled = false,
}: {
  locale: string
  workspaceSlug: string
  location: string
  label: string
  actionId?: string
  versionId?: string
  ask?: "explain_priority" | "compare_priorities" | "revise_action"
  className?: string
  variant?: "outline" | "ghost" | "default" | "secondary"
  size?: "sm" | "default" | "lg" | "icon"
  /** Keep the draft-editor rule: save or undo edits before asking Kinnso to revise. */
  disabled?: boolean
}) {
  const params = new URLSearchParams({ location })
  if (actionId) params.set("action", actionId)
  if (versionId) params.set("version", versionId)
  if (ask) params.set("ask", ask)
  const content = <><Sparkles aria-hidden="true" /><span>{label}</span></>
  if (disabled) {
    return <Button type="button" variant={variant} size={size} className={className} disabled>{content}</Button>
  }
  return (
    <Button asChild variant={variant} size={size} className={className}>
      <Link href={`/${locale}/owner/${workspaceSlug}/conversation?${params.toString()}`}>{content}</Link>
    </Button>
  )
}
