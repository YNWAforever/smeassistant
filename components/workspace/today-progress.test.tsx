// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ usePathname: () => "/zh-HK/owner/shop", useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))

import { ScanHistoryBars } from "@/components/visual/scan-history-bars"
import { progressCopy } from "@/lib/copy-progress"
import { buildProgress, profileLevel } from "@/lib/workspace/progress"
import { ShopPhotoStrip, ShopProfileCard, TodayProgress } from "./today-progress"

const render = (node: React.ReactElement) => {
  const root = document.createElement("div")
  root.innerHTML = renderToStaticMarkup(node)
  return root
}
const emptyProfile = profileLevel({ brand: null, approvedPhotos: 0, googleConnected: false, instagramHandle: null })
const progress = buildProgress({ signals: { approved: 1, delivered: 0, completed: 1, active_weeks: ["2026-10-19"], this_week: "2026-10-26" }, monthDone: 2, open: 6, profile: emptyProfile })

describe("progress copy", () => {
  it("has the same keys in every locale", () => {
    const keys = (value: unknown, prefix = ""): string[] => value && typeof value === "object"
      ? Object.entries(value).flatMap(([key, child]) => keys(child, `${prefix}${key}.`)) : [prefix]
    expect(keys(progressCopy["zh-HK"])).toEqual(keys(progressCopy.en))
    expect(keys(progressCopy["zh-TW"])).toEqual(keys(progressCopy.en))
  })
})

describe("TodayProgress", () => {
  it("shows effort, a live streak, earned and locked badges, and says it is not a result", () => {
    const root = render(<TodayProgress locale="zh-HK" progress={progress} moduleStates={null} base="/zh-HK/owner/shop" location="primary" />)
    expect(root.querySelector(".k-progress-ring")?.getAttribute("aria-label")).toBe("今個月做完 25%")
    expect(root.textContent).toContain("做完 2 項 · 仲有 6 項")
    expect(root.textContent).toContain("連續 1 個星期")
    expect(root.textContent).toContain("今個星期做一件，保持紀錄。")
    expect(root.querySelectorAll(".today-badges li[data-earned]")).toHaveLength(1)
    expect(root.textContent).toContain("唔係效果")
    // No score anywhere in the panel.
    expect(root.querySelector(".k-score")).toBeNull()
  })

  it("shows which sources were checked when there is a snapshot", () => {
    const state = (status: "measured" | "unavailable") => ({ status, confidence: "high" as const, limitationCode: null, score: null })
    const root = render(<TodayProgress locale="en" progress={progress} base="/en/owner/shop" location="primary"
      moduleStates={{ google_business: state("measured"), instagram: state("unavailable"), search_ai: state("measured"), website: state("unavailable") }} />)
    expect(root.querySelector(".today-progress-sources .k-coverage")).not.toBeNull()
  })
})

describe("ShopPhotoStrip", () => {
  it("shows the shop's own photos when there are some", () => {
    const root = render(<ShopPhotoStrip locale="en" photos={[{ id: "a", url: "https://blob.example/a.jpg", alt: "Noodles" }]} base="/en/owner/shop" canUpload />)
    expect(root.querySelector("img")?.getAttribute("alt")).toBe("Noodles")
    expect(root.textContent).not.toContain("Pexels")
  })

  it("makes no outside request when sample photos are off", () => {
    const root = render(<ShopPhotoStrip locale="en" photos={[]} base="/en/owner/shop" canUpload showStock={false} />)
    expect(root.innerHTML).not.toContain("pexels")
    expect(root.querySelector(".shop-photos-placeholder")).not.toBeNull()
  })

  it("labels the stand-in as a sample photo and hides upload from viewers", () => {
    const root = render(<ShopPhotoStrip locale="zh-HK" photos={[]} base="/zh-HK/owner/shop" canUpload={false} />)
    expect(root.textContent).toContain("示意圖")
    expect(root.querySelector(".shop-photos-add")).toBeNull()
    expect(render(<ShopPhotoStrip locale="zh-HK" photos={[]} base="/zh-HK/owner/shop" canUpload />).querySelector(".shop-photos-add")?.getAttribute("href")).toBe("/zh-HK/owner/shop/business/assets")
  })
})

describe("ShopProfileCard", () => {
  it("links only unfinished items it has a link for", () => {
    const profile = profileLevel({ brand: { voice: "warm", facts: {}, approved_claims: [] }, approvedPhotos: 0, googleConnected: false, instagramHandle: null })
    const root = render(<ShopProfileCard locale="en" profile={profile} photo={null} links={{ voice: "/v", photo: "/p" }} />)
    expect(Array.from(root.querySelectorAll(".shop-profile-items a")).map((a) => a.getAttribute("href"))).toEqual(["/p"])
    expect(root.querySelector(".k-progress-ring")?.getAttribute("aria-label")).toBe("1 of 6 filled in")
  })
})

describe("ScanHistoryBars", () => {
  it("marks a scan that cannot be compared with the one before and never shows a score", () => {
    const root = render(<ScanHistoryBars title="Checks" gapLabel="gap" bars={[
      { id: "1", label: "1 Oct", coverage: 60, comparableToPrevious: true },
      { id: "2", label: "1 Nov", coverage: 85, comparableToPrevious: false },
    ]} />)
    expect(root.querySelectorAll(".k-scan-bar[data-gap]")).toHaveLength(1)
    expect(root.querySelector("figure")?.getAttribute("aria-label")).toBe("Checks. 1 Oct: 60%, 1 Nov: 85%")
  })
})
