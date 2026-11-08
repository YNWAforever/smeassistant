"use client"

import { useState, type ComponentProps } from "react"
import { Sparkles } from "lucide-react"
import { Slot } from "radix-ui"

import { Button } from "@/components/ui/button"
import { copy } from "@/lib/copy"
import { retryableLoad } from "@/lib/retryable-load"

import type { ContextualAssistant as AssistantPanel } from "./assistant-sheet"

type AssistantProps = ComponentProps<typeof AssistantPanel>

// A failed load (a hover prefetch included) is never cached, so the next press retries it.
const loadPanel = retryableLoad(() => import("./assistant-sheet"))

/**
 * The Visibility Operator's trigger, without the sheet. The panel, its demo
 * answers and its request code (~54 kB gzip) load only when a visitor reaches
 * for it: hover or focus starts the download, a click renders the real
 * ContextualAssistant already open. The trigger markup matches the panel's
 * own, so nothing moves when it takes over.
 */
export function ContextualAssistant(props: AssistantProps) {
  const [Panel, setPanel] = useState<typeof AssistantPanel | null>(null)
  const [loading, setLoading] = useState(false)

  if (Panel) return <Panel {...props} initialOpen />

  const prefetch = () => void loadPanel().catch(() => undefined)
  const open = () => {
    if (props.disabled || loading) return
    setLoading(true)
    loadPanel()
      .then((module) => setPanel(() => module.ContextualAssistant))
      .catch(() => {
        // A failed chunk load leaves the trigger usable for another try.
        setLoading(false)
      })
  }
  const handlers = {
    onClick: open,
    onPointerEnter: prefetch,
    onFocus: prefetch,
    "aria-haspopup": "dialog" as const,
    "aria-expanded": false,
    "aria-busy": loading || undefined,
  }

  if (props.trigger) return <Slot.Root {...handlers}>{props.trigger}</Slot.Root>
  const label = props.triggerLabel ?? copy[props.locale].shell.assistant.name
  // aria-label: the workspace top bar hides the text on phones and shows the icon only.
  return (
    <Button className="assistant-launcher" variant="outline" disabled={props.disabled} aria-label={label} {...handlers}>
      <Sparkles aria-hidden="true" />
      <span>{label}</span>
    </Button>
  )
}
