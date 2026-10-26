/**
 * Decorative stock photos (Pexels licence; credited anyway, as the landing page
 * once did). Used only where the shop has no photo of its own, always labelled
 * "sample photo", and never as evidence about the shop (CLAUDE.md §0 guardrail 12).
 */
export type StockPhoto = { key: "cafe" | "tailor" | "shop"; src: string; credit: string; href: string }

export const STOCK_PHOTOS: Record<StockPhoto["key"], StockPhoto> = {
  cafe: {
    key: "cafe",
    src: "https://images.pexels.com/photos/4473399/pexels-photo-4473399.jpeg?auto=compress&dpr=1&h=750&w=1260",
    credit: "Ketut Subiyanto",
    href: "https://www.pexels.com/photo/happy-ethnic-coffee-shop-owner-standing-at-entrance-door-4473399/",
  },
  tailor: {
    key: "tailor",
    src: "https://images.pexels.com/photos/7147547/pexels-photo-7147547.jpeg?auto=compress&dpr=1&h=750&w=1260",
    credit: "Michael Burrows",
    href: "https://www.pexels.com/photo/smiling-asian-tailor-with-illustration-against-sewing-machine-in-workroom-7147547/",
  },
  shop: {
    key: "shop",
    src: "https://images.pexels.com/photos/6949788/pexels-photo-6949788.jpeg?auto=compress&dpr=1&h=750&w=1260",
    credit: "Prem Kumar",
    href: "https://www.pexels.com/photo/portrait-of-a-woman-in-a-store-6949788/",
  },
}

/** Decorative sample photos load from images.pexels.com; "off" keeps pages free of outside requests (tests, locked-down hosts). */
export function stockPhotosEnabled(): boolean {
  return process.env.STOCK_PHOTOS !== "off"
}
