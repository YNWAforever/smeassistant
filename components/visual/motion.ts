"use client"

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react"

/** Mirrors the motion tokens in app/styles/tokens.css for JS-driven motion. */
export const MOTION = { fast: 150, base: 220, slow: 300, explain: 600, stagger: 40 } as const

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)"
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

function readReducedMotion(): boolean {
  if (typeof window === "undefined") return true
  if (document.documentElement.dataset.motion === "reduce") return true
  // Without matchMedia (old engines, tests) we cannot tell: stay still.
  if (typeof window.matchMedia !== "function") return true
  return window.matchMedia(REDUCE_QUERY).matches
}

function subscribeReducedMotion(onChange: () => void): () => void {
  const media = typeof window.matchMedia === "function" ? window.matchMedia(REDUCE_QUERY) : null
  media?.addEventListener?.("change", onChange)
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] })
  return () => {
    media?.removeEventListener?.("change", onChange)
    observer.disconnect()
  }
}

/**
 * True when the device asks for reduced motion or the manual switch is on.
 * The server and the first client render report true, so nothing animates
 * before we know.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => true)
}

/**
 * Whether the element is on screen. Loops use it to pause offscreen
 * (data-offscreen). Without IntersectionObserver it reports true.
 */
export function useInView<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(true)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)), { threshold: 0 })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, inView]
}

export type RevealState = "static" | "pending" | "in"

/**
 * One-shot reveal for explanatory motion. Elements already on screen when the
 * page loads are never hidden ("static"); only those below the fold wait
 * ("pending") and play once when they arrive ("in"). Reduced motion stays
 * static. Same contract as components/motion-director.tsx.
 */
export function useReveal<T extends HTMLElement>(): [RefObject<T | null>, RevealState] {
  const ref = useRef<T>(null)
  const [state, setState] = useState<RevealState>("static")
  useIsomorphicLayoutEffect(() => {
    const element = ref.current
    if (!element || readReducedMotion() || typeof IntersectionObserver === "undefined") return
    if (element.getBoundingClientRect().top < window.innerHeight * 0.92) return
    setState("pending")
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      setState("in")
      observer.disconnect()
    }, { rootMargin: "0px 0px -8% 0px" })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, state]
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * A number that counts to `target`. It renders the target straight away (so
 * server HTML and screen readers get the real value) and only counts when:
 * - `target` changes after mount and `animate` is true, from the old value; or
 * - `play` changes (a reveal or a replay), from `from` (default 0).
 * Reduced motion always shows the target.
 */
export function useCountUp(target: number, { animate = true, play, from = 0, duration = MOTION.explain }: { animate?: boolean; play?: unknown; from?: number; duration?: number } = {}): number {
  const [shown, setShown] = useState(target)
  const shownRef = useRef(target)
  const previousTarget = useRef(target)
  const previousPlay = useRef(play)
  const reduced = useReducedMotion()

  useEffect(() => {
    const targetChanged = previousTarget.current !== target
    const playChanged = previousPlay.current !== play
    previousTarget.current = target
    previousPlay.current = play
    if (!targetChanged && !playChanged) return
    const start = playChanged ? from : shownRef.current
    const settle = () => { shownRef.current = target; setShown(target) }
    if (reduced || (targetChanged && !playChanged && !animate) || typeof requestAnimationFrame !== "function") {
      settle()
      return
    }
    let frame = 0
    const began = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / duration)
      const value = start + (target - start) * easeOut(t)
      shownRef.current = value
      setShown(value)
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    // Interrupted (new target, unmount, motion switched off): land on the target.
    return () => { cancelAnimationFrame(frame); settle() }
  }, [target, play, animate, from, duration, reduced])

  return shown
}
