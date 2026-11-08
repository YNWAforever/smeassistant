// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ThemeMenu, useWorkspaceTheme, WorkspaceTheme } from "./workspace-theme"

function mockDevice(dark: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: dark && query.includes("dark"), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
  delete document.documentElement.dataset.themePref
  document.cookie = "kinnso-theme=; Max-Age=0; Path=/"
})

describe("WorkspaceTheme", () => {
  it("is light when no choice is saved, even on a dark device", () => {
    mockDevice(true)
    render(<WorkspaceTheme><p>page</p></WorkspaceTheme>)
    expect(document.documentElement.dataset.theme).toBe("light")
  })

  it("follows the device only when match-device is saved", () => {
    mockDevice(true)
    document.documentElement.dataset.themePref = "system"
    render(<WorkspaceTheme><p>page</p></WorkspaceTheme>)
    expect(document.documentElement.dataset.theme).toBe("dark")
  })

  it("applies a saved dark choice", () => {
    mockDevice(false)
    document.documentElement.dataset.themePref = "dark"
    render(<WorkspaceTheme><p>page</p></WorkspaceTheme>)
    expect(document.documentElement.dataset.theme).toBe("dark")
  })

  it("renders the hidden workspace marker the pre-hydration CSS keys on", () => {
    mockDevice(false)
    const { container } = render(<WorkspaceTheme><p>page</p></WorkspaceTheme>)
    const marker = container.querySelector("[data-theme-scope]")
    expect(marker?.hasAttribute("hidden")).toBe(true)
  })

  it("saves a choice to the cookie the server reads, and applies it at once", () => {
    mockDevice(false)
    function Pick() {
      const theme = useWorkspaceTheme()
      return <button type="button" onClick={() => theme?.setPreference("dark")}>pick</button>
    }
    render(<WorkspaceTheme><Pick /></WorkspaceTheme>)
    act(() => { fireEvent.click(screen.getByRole("button", { name: "pick" })) })
    expect(document.cookie).toContain("kinnso-theme=dark")
    expect(document.documentElement.dataset.themePref).toBe("dark")
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
