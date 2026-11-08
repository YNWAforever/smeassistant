"use client"

import { useSyncExternalStore } from "react"

import type { ResolvedTheme } from "@/lib/theme"

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
  return () => observer.disconnect()
}

/** The theme actually on the page: dark only inside the workspace (lib/theme.ts). */
export function useDocumentTheme(): ResolvedTheme {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"),
    () => "light",
  )
}
