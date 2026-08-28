/** Owner-set preferred_display_name overrides the self-chosen display_name everywhere it's shown */
export function effectiveDisplayName(p: {
  display_name: string
  preferred_display_name?: string | null
}): string {
  return p.preferred_display_name || p.display_name
}
