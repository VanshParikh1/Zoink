/** The API's own message for a failed request, or `fallback`. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  return (error as { response?: { data?: { error?: string } } } | null)?.response?.data?.error ?? fallback
}
