// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"

import { GettingStarted } from "./getting-started"

afterEach(cleanup)

const items = [
  { key: "ownership" as const, done: true, href: null },
  { key: "brand" as const, done: false, href: "/en/owner/kam/business/profile" },
  { key: "google" as const, done: false, href: null },
  { key: "approve" as const, done: true, href: "/en/owner/kam/actions?view=awaiting_approval" },
  { key: "deliver" as const, done: false, href: "/en/owner/kam/actions?view=awaiting_approval" },
]

it("shows only the next unfinished step and its permitted link", () => {
  render(<GettingStarted items={items} locale="en" />)
  expect(screen.getByRole("link", { name: "Set your brand voice" })).toHaveAttribute("href", "/en/owner/kam/business/profile")
  expect(screen.queryByText("Connect Google Business")).toBeNull()
  expect(screen.queryByText("Approve your first draft")).toBeNull()
  expect(screen.queryAllByRole("listitem")).toHaveLength(1)
})

it("hides setup after first delivery even when earlier steps are incomplete", () => {
  const { container } = render(<GettingStarted items={items.map(item => item.key === "deliver" ? { ...item, done: true } : item)} locale="en" />)
  expect(container.textContent).toBe("")
})

it("keeps a step without a permitted link as text", () => {
  render(<GettingStarted items={items.map(item => ({ ...item, href: null }))} locale="en" />)
  expect(screen.queryByRole("link")).toBeNull()
  expect(screen.getByText("Set your brand voice")).toBeTruthy()
})

it.each(["zh-HK", "zh-TW"] as const)("is written in %s", (locale) => {
  const { container } = render(<GettingStarted items={items} locale={locale} />)
  expect(container.textContent).toContain("開始使用")
  expect(container.textContent).not.toMatch(/Getting started|done|Approve/)
})
