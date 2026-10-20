import { afterEach, describe, expect, it, vi } from "vitest"

const { notFound } = vi.hoisted(() => ({ notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND") }) }))
vi.mock("next/navigation", () => ({ notFound, useRouter: () => ({ push: vi.fn() }) }))

import sitemap from "@/app/sitemap"
import { devRoutesEnabled } from "@/lib/dev-routes"

import DesignSystemPage, { metadata } from "./page"

afterEach(() => { vi.unstubAllEnvs(); notFound.mockClear() })

describe("/dev/design-system", () => {
  it("is disabled in production and enabled elsewhere", () => {
    expect(devRoutesEnabled("production")).toBe(false)
    expect(devRoutesEnabled("development")).toBe(true)
    expect(devRoutesEnabled("test")).toBe(true)
  })

  it("answers 404 in a production build", async () => {
    vi.stubEnv("NODE_ENV", "production")
    await expect(DesignSystemPage({ params: Promise.resolve({ locale: "en" }) })).rejects.toThrow("NEXT_NOT_FOUND")
    expect(notFound).toHaveBeenCalledOnce()
  })

  it("is noindex and absent from the sitemap", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(sitemap().some((entry) => entry.url.includes("/dev/"))).toBe(false)
  })
})
