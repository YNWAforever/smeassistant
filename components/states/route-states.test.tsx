// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

const nav = vi.hoisted(() => ({ params: {} as Record<string, string>, pathname: "/" }))
vi.mock("next/navigation", () => ({ useParams: () => nav.params, usePathname: () => nav.pathname }))

import GlobalError from "@/app/global-error"
import WorkspaceNotFound from "@/app/[locale]/owner/[workspaceSlug]/not-found"
import { PageSkeleton } from "./page-skeleton"
import { RouteError } from "./route-error"

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const failure = Object.assign(new Error("db down"), { digest: "4120987" })

it("shows a retry that re-fetches, the digest as a reference, and the home page outside a workspace", () => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  nav.params = { locale: "en" }
  const retry = vi.fn()
  const { container } = render(<RouteError error={failure} unstable_retry={retry} home="site" />)
  expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong")
  expect(screen.getByText("Reference: 4120987")).toBeTruthy()
  expect(container.textContent).not.toContain("db down")
  fireEvent.click(screen.getByRole("button", { name: "Try again" }))
  expect(retry).toHaveBeenCalledTimes(1)
  expect(screen.getByRole("link", { name: "Go to the home page" })).toHaveAttribute("href", "/en")
  expect(container.querySelector("main")).not.toBeNull()
})

it("inside a workspace keeps the shell's <main>, offers Today and speaks the page's language", () => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  nav.params = { locale: "zh-TW", workspaceSlug: "shop" }
  const { container } = render(<RouteError error={new Error("x")} unstable_retry={vi.fn()} home="today" />)
  expect(container.querySelector("main")).toBeNull()
  expect(screen.getByRole("link", { name: "返回今日" })).toHaveAttribute("href", "/zh-TW/owner/shop")
  expect(container.textContent).not.toContain("參考編號")
})

it("an unknown page inside a workspace leads back to Today", () => {
  nav.params = { locale: "zh-HK", workspaceSlug: "shop" }
  render(<WorkspaceNotFound />)
  expect(screen.getByRole("heading", { level: 1, name: "找不到此頁" })).toBeTruthy()
  expect(screen.getByRole("link", { name: "返回今日" })).toHaveAttribute("href", "/zh-HK/owner/shop")
})

it("the loading skeleton announces itself once and hides its shapes from screen readers", () => {
  nav.params = { locale: "en" }
  const { container } = render(<PageSkeleton variant="list" />)
  expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true")
  expect(screen.getByRole("status")).toHaveTextContent("Loading…")
  expect(container.querySelectorAll("[aria-hidden=true]").length).toBeGreaterThan(0)
})

it("the global error takes its language from the path and works without providers", () => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  nav.pathname = "/zh-HK/owner/shop"
  const retry = vi.fn()
  render(<GlobalError error={failure} unstable_retry={retry} />, { container: document.documentElement })
  expect(screen.getByRole("heading", { name: "出現問題" })).toBeTruthy()
  expect(screen.getByText("參考編號：4120987")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "再試一次" }))
  expect(retry).toHaveBeenCalled()
  expect(screen.getByRole("link", { name: "前往首頁" })).toHaveAttribute("href", "/zh-HK")
})
