"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from "react"

const NARROW_RAIL = "(max-width: 1199px)"
function subscribeRail(listener: () => void) {
  const query = window.matchMedia(NARROW_RAIL)
  query.addEventListener("change", listener)
  return () => query.removeEventListener("change", listener)
}
export function useStudioRailModal() {
  return useSyncExternalStore(subscribeRail, () => window.matchMedia(NARROW_RAIL).matches, () => false)
}

function available(element: HTMLElement) {
  if (element.matches(":disabled") || element.closest("[hidden], [inert]")) return false
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (style.display === "none" || style.visibility === "hidden") return false
  }
  return true
}

/** One active Studio sheet at a time. The parent owns which sheet is open. */
export function useStudioOverlay({ active, rootRef, initialFocusRef, returnFocusRef, onClose }: {
  active: boolean
  rootRef: RefObject<HTMLElement | null>
  initialFocusRef: RefObject<HTMLElement | null>
  returnFocusRef?: RefObject<HTMLElement | null>
  onClose: () => void
}) {
  const close = useRef(onClose)
  const release = useRef<((restore: boolean) => void) | null>(null)
  useLayoutEffect(() => { close.current = onClose }, [onClose])

  useEffect(() => {
    const root = rootRef.current
    if (!active || !root) return
    const previous = returnFocusRef?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    const isolated: Array<{ element: HTMLElement; inert: string | null }> = []
    // Walk the ancestry so workspace navigation outside Studio is isolated too.
    for (let node: HTMLElement | null = root; node?.parentElement; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (!(sibling instanceof HTMLElement) || sibling === node || sibling.matches(".studio-overlay")) continue
        isolated.push({ element: sibling, inert: sibling.getAttribute("inert") })
        sibling.setAttribute("inert", "")
      }
      if (node.parentElement === document.body) break
    }
    // Responsive siblings can change their own inert prop while a sheet stays
    // open. Keep them isolated, but restore their latest intended state later.
    const rememberInertChanges = (records: MutationRecord[]) => {
      for (const record of records) {
        const entry = isolated.find(({ element }) => element === record.target)
        if (entry) entry.inert = entry.element.getAttribute("inert")
      }
    }
    const observeInert = () => {
      for (const { element } of isolated) observer.observe(element, { attributes: true, attributeFilter: ["inert"] })
    }
    const observer = new MutationObserver((records) => {
      observer.disconnect()
      rememberInertChanges(records)
      for (const { element } of isolated) element.setAttribute("inert", "")
      observeInert()
    })
    observeInert()
    const focusFirst = () => (initialFocusRef.current ?? root).focus({ preventScroll: true })
    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !root.contains(event.target)) focusFirst()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopImmediatePropagation()
        close.current()
      }
      if (event.key !== "Tab") return
      const items = Array.from(root.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, summary, [tabindex]")).filter((item) => item.tabIndex >= 0 && available(item))
      const first = items[0]
      const last = items.at(-1)
      if (!first || !last) {
        event.preventDefault()
        root.focus()
      } else if (!root.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    // Bubble phase lets rename consume Escape before the drawer handles it.
    window.addEventListener("keydown", onKey)
    document.addEventListener("focusin", onFocus)
    focusFirst()
    let released = false
    const cleanup = (restore: boolean) => {
      if (released) return
      released = true
      window.removeEventListener("keydown", onKey)
      document.removeEventListener("focusin", onFocus)
      rememberInertChanges(observer.takeRecords())
      observer.disconnect()
      for (const { element, inert } of isolated) {
        if (inert === null) element.removeAttribute("inert")
        else element.setAttribute("inert", inert)
      }
      const focused = document.activeElement
      const focusWasInOverlay = focused === document.body || (focused instanceof Node && root.contains(focused))
      if (restore && focusWasInOverlay && previous?.isConnected && available(previous)) previous.focus({ preventScroll: true })
    }
    release.current = cleanup
    return () => { cleanup(true); release.current = null }
  }, [active, initialFocusRef, rootRef, returnFocusRef])

  // Release synchronously before the parent moves focus to the composer.
  return useCallback(() => release.current?.(false), [])
}
