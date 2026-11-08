"use client"

import type { Market } from "@sme-scanner/region"
import { createContext, useContext, useState, type ReactNode } from "react"

/**
 * The market the visitor chose in the hero (guardrail 11: market is explicit
 * and the interface language never changes it). The pricing teaser reads it,
 * so the price shown always matches the market the scan will run in.
 */
const MarketContext = createContext<{ market: Market; setMarket: (market: Market) => void } | null>(null)

export function LandingMarketProvider({ initial, children }: { initial: Market; children: ReactNode }) {
  const [market, setMarket] = useState<Market>(initial)
  return <MarketContext.Provider value={{ market, setMarket }}>{children}</MarketContext.Provider>
}

export function useLandingMarket(fallback: Market): { market: Market; setMarket: (market: Market) => void } {
  return useContext(MarketContext) ?? { market: fallback, setMarket: () => {} }
}
