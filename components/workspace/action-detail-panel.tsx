import { LazyActionDetailClient } from "@/components/workspace/action-detail-lazy"
import { ActionProgress } from "@/components/workspace/action-progress"
import type { ActionDetailViewProps } from "@/components/workspace/action-detail-view"

/** ActionDetailView for the Actions side panel: the same detail, with the editor loaded on demand. */
export function ActionDetailPanel(props: ActionDetailViewProps) {
  return (
    <>
      <ActionProgress versions={props.detail.versions} locale={props.locale} />
      <LazyActionDetailClient {...props} embedded />
    </>
  )
}
