/**
 * A minimal, sanitised summary for a request that never got a response.
 *
 * Never log the AxiosError itself: its `config` carries the Authorization
 * header, the request URL and the request body (which can include payment
 * amounts), and `request` can carry the transport URL. Only the transport
 * code is safe and useful, and only when it looks like a code, not free text.
 */
const SAFE_CODE = /^[A-Z0-9_]{1,40}$/;

export const safeResponseLessError = (error: unknown) => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && SAFE_CODE.test(code)
    ? `API request failed (${code})`
    : "API request failed";
};
