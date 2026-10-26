import { describe, expect, it } from "vitest"

import { badges, buildProgress, monthProgress, profileLevel, weeklyStreak } from "./progress"

describe("monthProgress", () => {
  it("counts done out of done plus open, and is 0% with nothing on the plate", () => {
    expect(monthProgress(2, 8)).toEqual({ done: 2, open: 8, total: 10, percent: 20 })
    expect(monthProgress(0, 0)).toEqual({ done: 0, open: 0, total: 0, percent: 0 })
    expect(monthProgress(-1, 3.7).percent).toBe(0)
  })
})

describe("weeklyStreak", () => {
  it("counts consecutive weeks ending this week", () => {
    expect(weeklyStreak(["2026-10-26", "2026-10-19", "2026-10-12", "2026-09-28"], "2026-10-26")).toEqual({ weeks: 3, activeThisWeek: true })
  })

  it("keeps last week's streak alive until this week is over", () => {
    expect(weeklyStreak(["2026-10-19", "2026-10-12"], "2026-10-26")).toEqual({ weeks: 2, activeThisWeek: false })
  })

  it("is zero after a missed week and across a year boundary counts correctly", () => {
    expect(weeklyStreak(["2026-10-12"], "2026-10-26").weeks).toBe(0)
    expect(weeklyStreak(["2027-01-04", "2026-12-28"], "2027-01-04").weeks).toBe(2)
  })
})

describe("profileLevel", () => {
  it("levels by how many of the six items are filled in", () => {
    const empty = profileLevel({ brand: null, approvedPhotos: 0, googleConnected: false, instagramHandle: null })
    expect(empty).toMatchObject({ done: 0, total: 6, level: 1 })
    const full = profileLevel({ brand: { voice: "warm", facts: { seats: "40" }, approved_claims: ["Home cooking"] }, approvedPhotos: 2, googleConnected: true, instagramHandle: "shop" })
    expect(full).toMatchObject({ done: 6, level: 4 })
    expect(full.items.every((item) => item.done)).toBe(true)
    const half = profileLevel({ brand: { voice: "warm", facts: {}, approved_claims: [] }, approvedPhotos: 1, googleConnected: false, instagramHandle: "shop" })
    expect(half).toMatchObject({ done: 3, level: 2 })
  })
})

describe("badges", () => {
  it("earns badges only from things the owner did", () => {
    const profile = profileLevel({ brand: null, approvedPhotos: 0, googleConnected: false, instagramHandle: null })
    expect(badges({ approved: 0, delivered: 0, completed: 0 }, 0, profile).every((badge) => !badge.earned)).toBe(true)
    const earned = badges({ approved: 1, delivered: 1, completed: 5 }, 4, profile).filter((badge) => badge.earned).map((badge) => badge.key)
    expect(earned).toEqual(["first_confirm", "first_copy", "five_done", "streak_4"])
  })
})

describe("buildProgress", () => {
  it("joins the month, streak, badges and profile", () => {
    const profile = profileLevel({ brand: null, approvedPhotos: 0, googleConnected: false, instagramHandle: null })
    const progress = buildProgress({ signals: { approved: 1, delivered: 0, completed: 1, active_weeks: ["2026-10-26"], this_week: "2026-10-26" }, monthDone: 1, open: 3, profile })
    expect(progress.month.percent).toBe(25)
    expect(progress.streakWeeks).toBe(1)
    expect(progress.badges.find((badge) => badge.key === "first_confirm")?.earned).toBe(true)
  })
})
