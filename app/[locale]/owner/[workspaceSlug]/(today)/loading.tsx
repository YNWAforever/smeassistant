import { PageSkeleton } from "@/components/states/page-skeleton"

/**
 * Shown inside the shell while Today loads. It sits in a route group so it covers Today only:
 * a loading boundary above a page that calls notFound() turns its 404 into a streamed 200.
 */
export default function WorkspaceLoading() {
  return <PageSkeleton variant="today" />
}
