import Link from "next/link"
import { ArrowRight, Award, BadgeCheck, Copy, Flame, ImagePlus, ListChecks, Lock, Store, Trophy } from "lucide-react"

import { AssetPreview } from "@/components/workspace/asset-preview"
import { CoverageMeter, type CoverageSource } from "@/components/visual/coverage-meter"
import { ProgressRing } from "@/components/visual/progress-ring"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { progressCopy } from "@/lib/copy-progress"
import { fill } from "@/lib/copy-ui"
import { STOCK_PHOTOS } from "@/lib/stock-photos"
import { PRIMARY_SOURCES, type ModuleStates } from "@/lib/workspace/module-states"
import type { BadgeKey, ProfileItemKey, Progress, ShopPhoto } from "@/lib/workspace/progress"

const BADGE_ICONS: Record<BadgeKey, typeof Award> = {
  first_confirm: BadgeCheck,
  first_copy: Copy,
  five_done: ListChecks,
  profile_complete: Store,
  streak_4: Trophy,
}

/**
 * Today's "your month" panel: effort only. The ring counts tasks done, the
 * streak counts active weeks, badges mark firsts; the coverage strip shows
 * which sources the latest scan could check (guardrail 2: unavailable is not 0).
 * The score itself stays under 點解咁講 (decided 2026-10-26).
 */
export function TodayProgress({ locale, progress, moduleStates, base, location, canAct = true }: {
  locale: PrototypeLocale
  /** Viewers can't confirm, copy or edit the profile, so the nudges to do so are left out. */
  canAct?: boolean
  progress: Progress
  moduleStates: ModuleStates | null
  base: string
  location: string
}) {
  const t = progressCopy[locale]
  const { month } = progress
  const sourceLabels = copy[locale].ui.sources
  const sources: CoverageSource[] | null = moduleStates
    ? PRIMARY_SOURCES.map((key) => ({ key, label: sourceLabels[key], state: moduleStates[key].status }))
    : null
  const next = progress.badges.find((badge) => !badge.earned)
  const streakText = progress.streakWeeks === 0 ? t.streak.none
    : progress.streakWeeks === 1 ? t.streak.one : fill(t.streak.many, { n: progress.streakWeeks })
  const profile = progress.profile
  const nextItem = profile.items.find((item) => !item.done)
  return (
    <section className="today-progress" aria-labelledby="today-progress-title">
      <h2 id="today-progress-title" className="today-progress-title">{t.title}</h2>
      <div className="today-progress-grid">
        <div className="today-progress-month">
          <ProgressRing percent={month.percent} label={fill(t.ringLabel, { percent: month.percent })}>
            <strong>{month.done}</strong><small>/{month.total}</small>
          </ProgressRing>
          <div>
            <p className="today-progress-big">{month.total === 0 ? t.monthEmpty : fill(t.monthDone, { done: month.done, open: month.open })}</p>
            <p className="today-progress-streak" data-active={progress.streakWeeks > 0 ? "" : undefined}>
              <Flame aria-hidden="true" /> <span>{streakText}</span>
            </p>
            {canAct && progress.streakWeeks > 0 && !progress.activeThisWeek && <p className="today-progress-hint">{t.streak.keep}</p>}
          </div>
        </div>
        <div className="today-progress-profile">
          <div className="today-progress-profile-head">
            <span>{t.profile.title}</span>
            <strong>{t.profile.levels[profile.level - 1]}</strong>
          </div>
          <div className="today-progress-steps" role="img" aria-label={fill(t.profile.levelOf, { done: profile.done, total: profile.total })}>
            {profile.items.map((item) => <span key={item.key} data-done={item.done ? "" : undefined} title={t.profileItems[item.key]} />)}
          </div>
          <p className="today-progress-hint">{fill(t.profile.levelOf, { done: profile.done, total: profile.total })}</p>
          {canAct && nextItem && <Link className="today-progress-link" href={`${base}/business?location=${location}`}>{fill(t.profile.next, { item: t.profileItems[nextItem.key] })}<ArrowRight aria-hidden="true" /></Link>}
        </div>
        {sources && <div className="today-progress-sources">
          <span className="today-progress-label">{t.sources}</span>
          <CoverageMeter sources={sources} locale={locale} />
        </div>}
      </div>
      <div className="today-badges">
        <span className="today-progress-label">{t.badgesTitle}</span>
        <ul>
          {progress.badges.map((badge) => {
            const Icon = badge.earned ? BADGE_ICONS[badge.key] : Lock
            const text = t.badges[badge.key]
            return (
              <li key={badge.key} data-earned={badge.earned ? "" : undefined} title={badge.earned ? text.name : fill(t.nextBadge, { how: text.how })}>
                <span className="today-badge-icon" aria-hidden="true"><Icon /></span>
                <span className="today-badge-name">{text.name}</span>
                <span className="sr-only">{badge.earned ? t.badgeEarned : t.badgeLocked}</span>
              </li>
            )
          })}
        </ul>
        {canAct && next && <p className="today-progress-hint">{fill(t.nextBadge, { how: t.badges[next.key].how })}</p>}
      </div>
      <p className="today-progress-note">{t.effortNote}</p>
    </section>
  )
}

function ShopPhotoImage({ photo, workspaceId, locale }: { photo: ShopPhoto; workspaceId: string; locale: PrototypeLocale }) {
  return <AssetPreview asset={{ id: photo.id, kind: "image", storage_path: "", filename: photo.alt, alt_text: photo.alt, signedUrl: photo.url }} workspaceId={workspaceId} locale={locale} />
}

/** The shop's own confirmed photos; a credited sample photo and an upload link when there are none. */
export function ShopPhotoStrip({ locale, workspaceId, photos, base, canUpload, stock = "cafe", showStock = true }: {
  locale: PrototypeLocale
  workspaceId: string
  photos: ShopPhoto[]
  base: string
  canUpload: boolean
  stock?: keyof typeof STOCK_PHOTOS
  /** From stockPhotosEnabled() on the server; false leaves the soft colour block with no outside request. */
  showStock?: boolean
}) {
  const t = progressCopy[locale].photos
  const assetsHref = `${base}/business/assets`
  if (photos.length > 0) {
    return (
      <section className="shop-photos" aria-label={t.title}>
        <div className="shop-photos-head"><h2>{t.title}</h2><Link href={assetsHref}>{t.manage}<ArrowRight aria-hidden="true" /></Link></div>
        <ul className="shop-photos-grid">
          {/* Signed URLs last a minute; AssetPreview renews one that expired before the lazy image loaded. */}
          {photos.map((photo) => <li key={photo.id}><ShopPhotoImage photo={photo} workspaceId={workspaceId} locale={locale} /></li>)}
        </ul>
      </section>
    )
  }
  const sample = STOCK_PHOTOS[stock]
  return (
    <section className="shop-photos shop-photos-empty" aria-label={t.title}>
      <figure className="shop-photos-sample">
        {showStock ? <>
          {/* Decorative: a background, so an offline or blocked image leaves the soft colour block, not a broken icon. */}
          <div className="shop-photos-sample-image" style={{ backgroundImage: `url("${sample.src}")` }} aria-hidden="true" />
          <figcaption><a href={sample.href} target="_blank" rel="noreferrer">{fill(t.stockCredit, { credit: sample.credit })}</a></figcaption>
        </> : <ImagePlus className="shop-photos-placeholder" aria-hidden="true" />}
      </figure>
      <div className="shop-photos-copy">
        <h2>{t.title}</h2>
        <p>{t.empty}</p>
        {canUpload && <Link className="shop-photos-add" href={assetsHref}><ImagePlus aria-hidden="true" />{t.add}</Link>}
      </div>
    </section>
  )
}

/**
 * Shop page header: the profile level as a ring, the six items as a checklist
 * with links, and a photo (the shop's own when it has one, else a credited sample).
 */
export function ShopProfileCard({ locale, workspaceId, profile, photo, links, showStock = true }: {
  locale: PrototypeLocale
  workspaceId: string
  showStock?: boolean
  profile: Progress["profile"]
  photo: ShopPhoto | null
  links: Partial<Record<ProfileItemKey, string>>
}) {
  const t = progressCopy[locale]
  const sample = STOCK_PHOTOS.shop
  const percent = Math.round((profile.done / profile.total) * 100)
  return (
    <section className="shop-profile-card" aria-labelledby="shop-profile-title">
      <figure className="shop-profile-photo">
        {photo
          ? <ShopPhotoImage photo={photo} workspaceId={workspaceId} locale={locale} />
          : showStock ? <>
            <div className="shop-photos-sample-image" style={{ backgroundImage: `url("${sample.src}")` }} aria-hidden="true" />
            <figcaption><a href={sample.href} target="_blank" rel="noreferrer">{fill(t.photos.stockCredit, { credit: sample.credit })}</a></figcaption>
          </> : <Store className="shop-photos-placeholder" aria-hidden="true" />}
      </figure>
      <div className="shop-profile-body">
        <div className="shop-profile-head">
          <ProgressRing percent={percent} label={fill(t.profile.levelOf, { done: profile.done, total: profile.total })} size={84}>
            <strong>{profile.done}</strong><small>/{profile.total}</small>
          </ProgressRing>
          <div>
            <h2 id="shop-profile-title">{t.profile.title}</h2>
            <p className="shop-profile-level"><Award aria-hidden="true" />{t.profile.levels[profile.level - 1]}</p>
          </div>
        </div>
        <ul className="shop-profile-items">
          {profile.items.map((item) => {
            const href = links[item.key]
            const body = <><span className="shop-profile-check" data-done={item.done ? "" : undefined} aria-hidden="true">{item.done ? <BadgeCheck /> : null}</span><span>{t.profileItems[item.key]}</span><span className="sr-only">{item.done ? t.itemDone : t.itemTodo}</span></>
            return <li key={item.key} data-done={item.done ? "" : undefined}>{href && !item.done ? <Link href={href}>{body}<ArrowRight aria-hidden="true" /></Link> : <span className="shop-profile-row">{body}</span>}</li>
          })}
        </ul>
      </div>
    </section>
  )
}
