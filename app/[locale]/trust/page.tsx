import type { Metadata } from "next";

import { TrustPage } from "@/components/public-pages";
import { normaliseLocale } from "@/lib/copy";

import { publicPageMetadata } from "../_meta";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return publicPageMetadata(normaliseLocale(locale), "trust");
}

export default async function Trust({ params }: { params: Promise<{ locale: string }> }) {
  return <TrustPage locale={normaliseLocale((await params).locale)} />;
}
