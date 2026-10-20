"use client"

import { Monitor, Moon, Sun } from "lucide-react"
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { parseThemePreference, resolveTheme, THEME_STORAGE_KEY, type ResolvedTheme, type ThemePreference } from "@/lib/theme"

// useLayoutEffect warns during SSR; the effect only matters in the browser.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

const DARK_QUERY = "(prefers-color-scheme: dark)"

type ThemeState = { preference: ThemePreference; resolved: ResolvedTheme; setPreference: (next: ThemePreference) => void }
const ThemeContext = createContext<ThemeState | null>(null)

function readPreference(): ThemePreference {
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return "light"
  }
}

/**
 * Owns `html[data-theme]` while a workspace page is mounted and removes it on
 * the way back to a public page, so dark mode never leaks out of the
 * workspace on a client-side navigation.
 */
export function WorkspaceTheme({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("light")
  const [prefersDark, setPrefersDark] = useState(false)

  useIsomorphicLayoutEffect(() => {
    setPreferenceState(readPreference())
    const media = window.matchMedia?.(DARK_QUERY)
    setPrefersDark(Boolean(media?.matches))
    if (!media) return
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches)
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  const resolved = resolveTheme(preference, prefersDark)

  useIsomorphicLayoutEffect(() => {
    document.documentElement.dataset.theme = resolved
  }, [resolved])

  useEffect(() => () => {
    delete document.documentElement.dataset.theme
  }, [])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) setPreferenceState(parseThemePreference(event.newValue))
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Storage unavailable: the choice still applies for this page view.
    }
  }, [])

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useWorkspaceTheme(): ThemeState | null {
  return useContext(ThemeContext)
}

const ICONS = { light: Sun, dark: Moon, system: Monitor } as const

export function ThemeMenu({ locale }: { locale: PrototypeLocale }) {
  const theme = useWorkspaceTheme()
  if (!theme) return null
  const t = copy[locale].common.theme
  const Icon = theme.preference === "system" ? Monitor : theme.resolved === "dark" ? Moon : Sun
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="theme-button" aria-label={`${t.label}: ${t[theme.preference]}`}>
          <Icon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t.label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme.preference} onValueChange={(value) => theme.setPreference(parseThemePreference(value))}>
          {(["light", "dark", "system"] as const).map((option) => {
            const OptionIcon = ICONS[option]
            return (
              <DropdownMenuRadioItem key={option} value={option}>
                <OptionIcon aria-hidden="true" />
                {t[option]}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
