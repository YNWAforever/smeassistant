// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const push = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => "/en",
  useSearchParams: () => new URLSearchParams(),
}))

import { LandingPage } from "@/components/landing-page"
import type { PublicBilling } from "@/lib/commercial/presentation"
import { t } from "@/lib/i18n"

const CLOSED: PublicBilling = { open: false, contactHref: { hk: null, tw: null } }

function markup(locale: "en" | "zh-HK" | "zh-TW" = "en", billing: PublicBilling = CLOSED) {
  const root = document.createElement("div")
  root.innerHTML = renderToStaticMarkup(<LandingPage locale={locale} market="hk" billing={billing} />)
  return root
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
})

afterEach(() => {
  cleanup()
  push.mockReset()
  vi.unstubAllGlobals()
})

describe("LandingPage hero", () => {
  it("has one headline and one primary submit, and promises no outcome", () => {
    const root = markup("zh-HK")
    expect(root.querySelectorAll("h1")).toHaveLength(1)
    expect(root.querySelector("h1")?.textContent).toBe("看清顧客如何找到你")
    expect(root.textContent).not.toContain("讓更多顧客找到你")
    expect(root.querySelectorAll("form button[type=submit]")).toHaveLength(1)
  })

  it("hands off to /scan with the chosen market, never the language", () => {
    render(<LandingPage locale="zh-TW" market="hk" billing={CLOSED} />)
    fireEvent.click(screen.getByLabelText(/台灣/))
    fireEvent.change(screen.getByLabelText("商家名稱或 Google Maps 連結"), { target: { value: "錦汶館" } })
    fireEvent.click(screen.getByRole("button", { name: "開始免費掃描" }))
    expect(push).toHaveBeenCalledWith("/zh-TW/scan?market=tw&business=%E9%8C%A6%E6%B1%B6%E9%A4%A8")
  })

  it("asks for a business before starting, and announces the error", () => {
    render(<LandingPage locale="en" market="hk" billing={CLOSED} />)
    fireEvent.click(screen.getByRole("button", { name: "Start free scan" }))
    expect(screen.getByRole("alert").textContent).toContain("Enter a business name or Google Maps link.")
    expect(push).not.toHaveBeenCalled()
  })

  it("describes the loop as an illustration with no real data", () => {
    const loop = markup("en").querySelector(".pl-loop")
    expect(loop?.getAttribute("role")).toBe("img")
    expect(loop?.getAttribute("aria-label")).toContain("No real data")
    expect(loop?.textContent).not.toMatch(/\d{2}/)
  })
})

describe("LandingPage sections", () => {
  it("keeps the page to the planned sections and drops the photos", () => {
    const root = markup("en")
    expect(root.querySelector("#how-it-works")).not.toBeNull()
    expect(root.querySelectorAll(".pl-source")).toHaveLength(5)
    expect(root.querySelector("img")).toBeNull()
    expect(root.textContent).not.toContain("SME Scanner")
  })

  it("labels the sample report as demo data from the fixed demo business", () => {
    const sample = markup("en").querySelector(".pl-sample")
    expect(sample?.textContent).toContain("Not a real customer")
    expect(sample?.querySelector("[data-fact-type]")?.getAttribute("data-fact-type")).toBe("Observed")
    expect(sample?.textContent).toContain("4 of 5 sources measured")
  })

  it("speaks Taiwanese Mandarin in zh-TW, not the zh-HK register", () => {
    const text = markup("zh-TW").textContent ?? ""
    expect(text).toContain("成長工作台")
    expect(text).not.toMatch(/[嘅呢揀咗]/)
  })
})

/**
 * P3.3: the Growth preview reads its allowance from the contract and, while
 * billing is closed, says so instead of implying a subscription is available.
 */
describe("LandingPage Growth plan card (P3.3)", () => {
  it("shows the not-open label and the unlimited-allowance line when billing is closed", () => {
    const growth = markup("en", CLOSED).querySelector("[data-plan=growth]")
    expect(growth?.textContent).toContain(t("en", "commercial.notOpen"))
    expect(growth?.textContent).toContain(t("en", "commercial.unlimitedLine"))
  })

  it("omits the not-open label, but keeps the allowance line, when billing is open", () => {
    const growth = markup("en", { open: true, contactHref: { hk: null, tw: null } }).querySelector("[data-plan=growth]")
    expect(growth?.textContent).not.toContain(t("en", "commercial.notOpen"))
    expect(growth?.textContent).toContain(t("en", "commercial.unlimitedLine"))
  })

  it("prices Growth in the market chosen in the hero", () => {
    render(<LandingPage locale="en" market="hk" billing={CLOSED} />)
    expect(document.querySelector("[data-plan=growth]")?.textContent).toContain("HK$")
    fireEvent.click(screen.getByLabelText(/Taiwan/))
    expect(document.querySelector("[data-plan=growth]")?.textContent).toContain("NT$")
  })
})

describe("LandingPage FAQ", () => {
  it("opens an answer from the keyboard-operable trigger", () => {
    render(<LandingPage locale="en" market="hk" billing={CLOSED} />)
    const trigger = screen.getByRole("button", { name: "Will anything be posted for me?" })
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(trigger)
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText(/nothing is published automatically/)).toBeTruthy()
  })
})
