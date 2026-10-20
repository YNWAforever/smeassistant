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

it("counts real steps, links only open steps the role may reach, and marks done ones", () => {
  render(<GettingStarted items={items} locale="en" />)
  expect(screen.getByText("2 of 5 done")).toBeTruthy()
  expect(screen.getByRole("link", { name: "Set your brand voice" })).toHaveAttribute("href", "/en/owner/kam/business/profile")
  expect(screen.queryByRole("link", { name: "Connect Google Business" })).toBeNull()
  expect(screen.queryByRole("link", { name: /Approve your first draft/ })).toBeNull()
  expect(screen.getByText("Approve your first draft").closest("li")).toHaveAttribute("data-done")
})

it.each(["zh-HK", "zh-TW"] as const)("is written in %s", (locale) => {
  const { container } = render(<GettingStarted items={items} locale={locale} />)
  expect(container.textContent).toContain("開始使用")
  expect(container.textContent).not.toMatch(/Getting started|done|Approve/)
})
