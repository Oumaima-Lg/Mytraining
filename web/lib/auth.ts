// Server-side auth constants + cookie helpers shared by the BFF route handlers.
export const ACCESS_COOKIE = "pe_access";
export const REFRESH_COOKIE = "pe_refresh";

export const API_INTERNAL_URL =
  process.env.API_INTERNAL_URL || "http://localhost:5000";

export const accessCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 30, // 30 min, matches JWT_ACCESS_TOKEN_MINUTES
};

export const refreshCookieOptions = {
  ...accessCookieOptions,
  maxAge: 60 * 60 * 24 * 30, // 30 days
};
