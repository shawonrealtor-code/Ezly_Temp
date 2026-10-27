// Shared by the proxy and server code, so it must not import anything server-only.
const secure = process.env.NODE_ENV === "production";

/** `__Host-` makes browsers refuse the cookie unless it is Secure, host-only and path=/. */
export const SESSION_COOKIE = secure ? "__Host-ezly_session" : "ezly_session";

export const sessionCookieOptions = (maxAgeSeconds: number) => ({
  httpOnly: true,
  secure,
  sameSite: "lax" as const,
  path: "/",
  maxAge: maxAgeSeconds,
});

/** Pages reachable without a signed-in session. */
export const PUBLIC_PATHS = ["/login", "/mfa"];
