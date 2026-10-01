/** The offer form's editable state. Plain data, so server pages can build it. */
export interface OfferFormInitial {
  title: string
  details: string
  terms: string
  price: string
  startsOn: string
  endsOn: string
  openEnded: boolean
  claims: string
  wording: string
  assetIds: string[]
  locationId: string | null
}

export const EMPTY_OFFER_FORM: OfferFormInitial = { title: "", details: "", terms: "", price: "", startsOn: "", endsOn: "", openEnded: false, claims: "", wording: "", assetIds: [], locationId: null }

/** "Start a new offer from this one": every fact except the dates, which are cleared. */
export function offerFormFrom(offer: { title: string; details: string; terms: string | null; price_amount: string | null; approved_claims: string[]; prohibited_wording: string[]; asset_ids: string[]; location_id: string | null }, keepDates?: { starts_on: string; ends_on: string | null; open_ended: boolean }): OfferFormInitial {
  return {
    title: offer.title,
    details: offer.details,
    terms: offer.terms ?? "",
    price: offer.price_amount !== null ? String(Number(offer.price_amount)) : "",
    startsOn: keepDates?.starts_on ?? "",
    endsOn: keepDates?.ends_on ?? "",
    openEnded: keepDates?.open_ended ?? false,
    claims: offer.approved_claims.join("\n"),
    wording: offer.prohibited_wording.join("\n"),
    assetIds: [...offer.asset_ids],
    locationId: offer.location_id,
  }
}
