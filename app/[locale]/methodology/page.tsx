import type { Metadata } from "next";

import { MethodologyPage } from "@/components/public-pages";
import { normaliseLocale } from "@/lib/copy";

import { publicPageMetadata } from "../_meta";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return publicPageMetadata(normaliseLocale(locale), "methodology");
}

export default async function Methodology({ params }: { params: Promise<{ locale: string }> }) {
  return <MethodologyPage locale={normaliseLocale((await params).locale)} />;
}
