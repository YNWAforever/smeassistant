/** Assignment only; ships dark. Existing product flags remain independent. */
export function actionBulkAssignEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ACTION_BULK_ASSIGN_ENABLED === "true";
}
