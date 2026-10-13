"use client"

import { usePathname } from "next/navigation"
import { useEffect } from "react"

/**
 * Progressive motion for the public site. Nothing here is required to read a
 * page: server-rendered content is visible without JavaScript, sections that
 * are already on screen when the effect runs are never hidden, and the whole
 * layer is skipped for `prefers-reduced-motion: reduce`. CSS for every state
 * lives in app/polish.css under `[data-reveal]`.
 */
const REVEAL_SELECTOR = [
  ".public-site main > section",
  ".public-site main > div > section",
  ".public-site .content-page > *",
  ".public-site .report-page > section",
].join(",")

export function MotionDirector() {
  const pathname = usePathname()

  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".public-header")
    const onScroll = () => header?.toggleAttribute("data-scrolled", window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })

    const cleanups: Array<() => void> = [() => window.removeEventListener("scroll", onScroll)]
    const allowMotion = window.matchMedia("(prefers-reduced-motion: no-preference)").matches

    if (allowMotion && "IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue
            entry.target.setAttribute("data-reveal", "in")
            observer.unobserve(entry.target)
          }
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0 },
      )
      const fold = window.innerHeight * 0.92
      const pending: HTMLElement[] = []
      for (const element of document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR)) {
        if (element.dataset.reveal || element.getBoundingClientRect().top < fold) continue
        element.dataset.reveal = "pending"
        pending.push(element)
        observer.observe(element)
      }
      cleanups.push(() => {
        observer.disconnect()
        for (const element of pending) if (element.dataset.reveal === "pending") element.dataset.reveal = "in"
      })
    }

    // A soft light that follows the pointer across the hero; fine pointers only.
    const hero = document.querySelector<HTMLElement>(".landing-hero")
    if (allowMotion && hero && window.matchMedia("(pointer: fine)").matches) {
      let frame = 0
      const onMove = (event: PointerEvent) => {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(() => {
          const box = hero.getBoundingClientRect()
          hero.style.setProperty("--mx", `${(((event.clientX - box.left) / box.width) * 100).toFixed(1)}%`)
          hero.style.setProperty("--my", `${(((event.clientY - box.top) / box.height) * 100).toFixed(1)}%`)
        })
      }
      hero.addEventListener("pointermove", onMove)
      cleanups.push(() => {
        cancelAnimationFrame(frame)
        hero.removeEventListener("pointermove", onMove)
      })
    }

    return () => cleanups.forEach((cleanup) => cleanup())
  }, [pathname])

  return null
}
