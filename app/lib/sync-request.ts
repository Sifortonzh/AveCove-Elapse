// Retry only transient failures. Authentication/capacity errors need action,
// not a retry storm. Replay uses the same immutable body and merge is idempotent.
export async function fetchSync(input: string, init: RequestInit = {}, onRetry?: (attempt: number) => void): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(input, { ...init, signal: AbortSignal.timeout(90_000) });
      if (![502, 503, 504].includes(response.status) || attempt >= 2) return response;
      await response.body?.cancel();
    } catch (error) {
      if (attempt >= 2) throw error;
    }
    onRetry?.(attempt + 1);
    await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1_500));
  }
}
