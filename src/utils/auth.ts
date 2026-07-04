/**
 * Auth token helpers.
 *
 * The API issues stateless JWTs. Because the token is just a persisted string,
 * the app can't tell an expired session from a live one by presence alone — so
 * we decode the `exp` claim client-side to gate access without waiting for a
 * server 401. The server's 401 (handled by the axios interceptor) remains the
 * source of truth for revocation; this is a fast, offline-capable first check.
 */

interface JwtPayload {
  exp?: number; // seconds since epoch
}

/** Decode a JWT payload without verifying the signature. Returns null if it isn't a decodable JWT. */
const decodeJwtPayload = (token: string): JwtPayload | null => {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((char) => "%" + char.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
};

/**
 * True only when the token can be decoded AND its `exp` is in the past.
 *
 * Deliberately conservative: an empty token, an opaque (non-JWT) token, or a
 * JWT with no `exp` returns `false`. We never lock a user out over a token we
 * can't read — the server's 401 covers those cases instead.
 */
export const isTokenExpired = (token: string): boolean => {
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false;
  return Date.now() >= payload.exp * 1000;
};
