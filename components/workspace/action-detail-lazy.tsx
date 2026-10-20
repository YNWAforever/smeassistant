"use client"

import dynamic from "next/dynamic"

/**
 * The action editor for the Actions side panel. It is loaded only when a panel
 * is open (?open=id), so the queue's first load does not carry it. Still
 * rendered on the server, so an open panel arrives complete.
 */
export const LazyActionDetailClient = dynamic(() => import("@/components/workspace/action-detail-client").then((m) => m.ActionDetailClient))
