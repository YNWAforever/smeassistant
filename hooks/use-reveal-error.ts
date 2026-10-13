"use client"

import { type RefObject, useEffect } from "react"

/** Bottom edge of the public header when it is on screen, else 0. */
export function coveredTop(): number {
  return Math.max(0, document.querySelector(".public-header")?.getBoundingClientRect().bottom ?? 0)
}

/** Scrolls `element` to the top of the window (below the header) when any part of it is out of view. */
export function revealElement(element: Element, target: Element = element) {
  const box = element.getBoundingClientRect()
  if (box.top >= coveredTop() && box.bottom <= window.innerHeight) return
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  target.scrollIntoView?.({ block: "start", behavior: reduce ? "auto" : "smooth" })
}

/**
 * Form errors render at the top of a card whose submit button sits at its
 * foot, so on a phone the message landed hundreds of pixels above the screen
 * and pressing the button seemed to do nothing. Bring the banner into view and
 * move focus to it, unless a field was focused on purpose (a field-level check
 * that focuses its input keeps that focus).
 */
export function useRevealError(banner: RefObject<HTMLElement | null>, error: string) {
  useEffect(() => {
    const element = banner.current
    if (!error || !element) return
    const active = document.activeElement
    if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement)) element.focus({ preventScroll: true })
    revealElement(element)
  }, [banner, error])
}
