"use client"

import { RouteError, type RouteErrorProps } from "@/components/states/route-error"

/** A failed workspace page keeps the shell (this sits inside its layout) and offers Today. */
export default function WorkspaceError(props: RouteErrorProps) {
  return <RouteError {...props} home="today" />
}
