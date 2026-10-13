"use client"

import { useEffect } from "react"

/**
 * Chrome does not scroll a focused element that is on screen but covered by a
 * fixed bar, so tabbing on a phone could land on a link hidden under the
 * workspace top bar or bottom nav (WCAG 2.4.11). On keyboard focus only, nudge
 * the page just far enough to clear whichever bar covers it.
 */
export function useFocusClearOfBars(top: string, bottom: string) {
  useEffect(() => {
    let frame = 0
    function onFocusIn(event: FocusEvent) {
      const target = event.target
      if (!(target instanceof HTMLElement) || !target.matches(":focus-visible")) return
      // The browser's own focus scrolling runs after this event; measure once it has.
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => clear(target))
    }
    function clear(target: HTMLElement) {
      const box = target.getBoundingClientRect()
      const gap = 12
      const bar = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector)
        if (!element || element.contains(target)) return null
        const rect = element.getBoundingClientRect()
        return rect.height > 0 && getComputedStyle(element).display !== "none" ? rect : null
      }
      const below = bar(bottom)
      if (below && box.bottom > below.top - gap && box.top < below.bottom) {
        window.scrollBy({ top: box.bottom - below.top + gap, behavior: "instant" })
        return
      }
      const above = bar(top)
      if (above && box.top < above.bottom + gap && box.bottom > above.top) window.scrollBy({ top: box.top - above.bottom - gap, behavior: "instant" })
    }
    document.addEventListener("focusin", onFocusIn)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener("focusin", onFocusIn)
    }
  }, [top, bottom])
}
