"use client"

import { RouteError, type RouteErrorProps } from "@/components/states/route-error"

/** A failed public or owner page outside a workspace: retry, a reference, and the home page. */
export default function LocaleError(props: RouteErrorProps) {
  return <RouteError {...props} home="site" />
}
