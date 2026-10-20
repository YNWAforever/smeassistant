// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ThemeMenu, WorkspaceTheme } from "./workspace-theme"
import { THEME_STORAGE_KEY } from "@/lib/theme"

function mockDevice(dark: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: dark && query.includes("dark"), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
  delete document.documentElement.dataset.theme
})

describe("WorkspaceTheme", () => {
  it("is light when no choice is saved, even on a dark device", () => {
    mockDevice(true)
    render(<WorkspaceTheme><p>page</p></WorkspaceTheme>)
    expect(document.documentElement.dataset.theme).toBe("light")
  })

  it("follows the device only when match-device is saved", () => {
    mockDevice(true)
    window.localStorage.setItem(THEME_STORAGE_KEY, "system")
    render(<WorkspaceTheme><p>page</p></WorkspaceTheme>)
    expect(document.documentElement.dataset.theme).toBe("dark")
  })

  it("applies a saved dark choice", () => {
    mockDevice(false)
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark")
    render(<WorkspaceTheme><p>page</p></WorkspaceTheme>)
    expect(document.documentElement.dataset.theme).toBe("dark")
  })

  it("removes the theme when leaving the workspace, so public pages stay light", () => {
    mockDevice(true)
    const { unmount } = render(<WorkspaceTheme><p>page</p></WorkspaceTheme>)
    act(() => unmount())
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it("labels the switch with the current choice in the page locale", () => {
    mockDevice(false)
    render(<WorkspaceTheme><ThemeMenu locale="zh-HK" /></WorkspaceTheme>)
    expect(screen.getByRole("button", { name: "外觀: 淺色" })).toBeTruthy()
  })

  it("renders nothing outside the workspace", () => {
    const { container } = render(<ThemeMenu locale="en" />)
    expect(container.innerHTML).toBe("")
  })
})
