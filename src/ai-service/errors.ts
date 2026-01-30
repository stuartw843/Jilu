export function isContextWindowError(error: unknown): boolean {
  const message =
    (error as any)?.response?.data?.error?.message ||
    (error as Error)?.message ||
    "";
  return /context length|tokens to keep/i.test(message);
}
