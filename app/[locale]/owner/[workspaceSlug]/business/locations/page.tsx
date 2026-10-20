import type { Metadata } from "next";
import Link from "next/link";
import { MapPin } from "lucide-react";

import { PageIntro } from "@/components/product-ui";
import { Badge } from "@/components/ui/badge";
import { copy } from "@/lib/copy";
import { withLocation } from "@/lib/workspace/format";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: copy.en.shell.locations.title, zh: copy["zh-HK"].shell.locations.title });
}

/**
 * Read-only list of the workspace's locations (new in Phase 4; before, the
 * nav linked to the workspace picker). Switching stays in the shell's
 * location menu; each row opens Today scoped to that location.
 */
export default async function LocationsRoute(props: OwnerPageProps) {
  const page = await loadOwnerPage(props);
  const t = copy[page.locale].shell.locations;
  const base = `/${page.locale}/owner/${page.workspaceSlug}`;
  return (
    <div className="destination-page">
      <PageIntro title={t.title} description={t.lead} />
      {page.ctx.locations.length === 0 ? (
        <p className="limitation-note">{t.empty}</p>
      ) : (
        <ul className="destination-list">
          {page.ctx.locations.map((location) => (
            <li key={location.id}>
              <Link className="destination-row" href={withLocation(base, location.slug)} aria-current={location.slug === page.locationSlug ? "true" : undefined}>
                <span className="destination-icon" aria-hidden="true"><MapPin /></span>
                <span className="destination-text">
                  <strong>{location.name}</strong>
                  <small>{[location.address ?? location.district, location.placeId ? t.place : t.noPlace].filter(Boolean).join(" · ")}</small>
                </span>
                {location.isPrimary && <Badge variant="outline">{t.primary}</Badge>}
                <span className="sr-only">{t.switch}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
