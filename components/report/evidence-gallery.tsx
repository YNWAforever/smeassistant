"use client";

import { useId, useState } from "react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { copy } from "@/lib/copy";
import type { ReportEvidenceItem, ReportProps } from "@/lib/funnel/report-props";
import { interpolate } from "@/lib/share";
import styles from "./evidence-gallery.module.css";

type GalleryProps = { items: ReportEvidenceItem[]; locale: ReportProps["locale"] };

// The authorized server loader has already removed sensitive source URLs.
// This client guard rejects executable protocols and credentials without altering signed media URLs.
function sourceLink(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? value : null;
  } catch { return null; }
}

function EvidenceCard({ item, locale, title }: { item: ReportEvidenceItem; locale: GalleryProps["locale"]; title: string }) {
  const c = copy[locale].funnel.report;
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const photo = item.status === "stored" && item.mediaUrl !== null && !thumbnailFailed;
  const source = sourceLink(item.sourceUrl);
  const unavailable = item.status === "metadata_only" ? c.evidenceMetadataOnly : item.status === "failed" ? c.evidenceFailed : c.evidenceStoredUnavailable;
  const metadata = <div className={styles.metadata}>
    <small><time dateTime={item.capturedAt}>{interpolate(c.evidenceCaptured, { date: item.capturedAt })}</time></small>
    {item.publishedAt && <small><time dateTime={item.publishedAt}>{interpolate(c.evidencePublished, { date: item.publishedAt })}</time></small>}
    {source && <a href={source} target="_blank" rel="noreferrer noopener">{c.evidenceSource}</a>}
    {item.limitationCode && <small>{item.limitationCode}</small>}
    {item.text && <details><summary>{c.evidenceCaption}</summary><p>{item.text}</p></details>}
  </div>;
  return <article className={styles.card}>
    {photo ? <Dialog>
      <DialogTrigger asChild>
        <button className={styles.thumbnail} type="button" aria-label={interpolate(c.evidenceOpen, { title })}>
          {/* Authorized short-lived URLs must bypass image optimization and never be replaced by provider URLs. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.mediaUrl!} alt={item.text?.slice(0, 120) || title} loading="lazy" decoding="async" onError={() => setThumbnailFailed(true)} />
        </button>
      </DialogTrigger>
      <DialogContent className={styles.preview} showCloseButton={false}>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{c.evidenceBody}</DialogDescription>
        {previewFailed ? <p className={styles.fallback}>{c.evidenceStoredUnavailable}</p> :
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.previewImage} src={item.mediaUrl!} alt={item.text?.slice(0, 120) || title} loading="lazy" decoding="async" onError={() => setPreviewFailed(true)} />}
        {metadata}
        <DialogClose className={styles.control}>{c.evidenceClose}</DialogClose>
      </DialogContent>
    </Dialog> : <p className={styles.fallback}>{unavailable}</p>}
    <h4>{title}</h4>
    {metadata}
  </article>;
}

function ProviderGroup({ provider, items, locale }: GalleryProps & { provider: string }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const name = provider === "instagram" ? "Instagram" : provider === "google_maps" ? "Google Maps" : provider;
  const c = copy[locale].funnel.report;
  return <section className={styles.group} aria-labelledby={`${id}-heading`}>
    <h3 id={`${id}-heading`}>{name} ({items.length})</h3>
    <div id={id} className={styles.grid}>
      {(expanded ? items : items.slice(0, 6)).map((item, index) => <EvidenceCard key={`${item.id}:${item.mediaUrl}`} item={item} locale={locale} title={`${name} · ${item.evidenceType} ${index + 1}`} />)}
    </div>
    {items.length > 6 && <button type="button" className={styles.control} aria-controls={id} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      {expanded ? c.evidenceShowLess : interpolate(c.evidenceShowMore, { count: items.length - 6 })}
    </button>}
  </section>;
}

/** Receives only the authorized evidence projection, never the full report or storage credentials. */
export function EvidenceGallery({ items, locale }: GalleryProps) {
  const c = copy[locale].funnel.report;
  if (!items.length) return null;
  const groups = new Map<string, ReportEvidenceItem[]>();
  for (const item of items) groups.set(item.provider, [...(groups.get(item.provider) ?? []), item]);
  return <section className={styles.gallery}>
    <p className="eyebrow">{c.evidenceEyebrow}</p>
    <h2>{c.evidenceTitle}</h2>
    <p>{c.evidenceBody}</p>
    {[...groups].map(([provider, group]) => <ProviderGroup key={provider} provider={provider} items={group} locale={locale} />)}
  </section>;
}