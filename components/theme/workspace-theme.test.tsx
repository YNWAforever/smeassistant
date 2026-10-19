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
  it("follows the device when no choice is saved", () => {
    mockDevice(true)
    render(<WorkspaceTheme><p>page</p></WorkspaceTheme>)
    expect(document.documentElement.dataset.theme).toBe("dark")
  })

  it("prefers a saved choice over the device", () => {
    mockDevice(true)
    window.localStorage.setItem(THEME_STORAGE_KEY, "light")
    render(<WorkspaceTheme><p>page</p></WorkspaceTheme>)
    expect(document.documentElement.dataset.theme).toBe("light")
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
    expect(screen.getByRole("button", { name: "外觀: 跟隨裝置" })).toBeTruthy()
  })

  it("renders nothing outside the workspace", () => {
    const { container } = render(<ThemeMenu locale="en" />)
    expect(container.innerHTML).toBe("")
  })
})
