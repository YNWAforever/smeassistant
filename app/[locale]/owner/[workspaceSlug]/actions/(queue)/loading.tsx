import { PageSkeleton } from "@/components/states/page-skeleton"

/** The queue skeleton. Grouped so it never covers action detail, which must keep its hard 404. */
export default function ActionsLoading() {
  return <PageSkeleton variant="list" />
}
