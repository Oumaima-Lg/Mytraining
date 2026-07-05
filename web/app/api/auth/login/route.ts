import { NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  API_INTERNAL_URL,
  accessCookieOptions,
  refreshCookieOptions,
} from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json();
  const upstream = await fetch(`${API_INTERNAL_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await upstream.json();
  if (!upstream.ok) {
    return NextResponse.json(data, { status: upstream.status });
  }
  const res = NextResponse.json({ user: data.user });
  res.cookies.set(ACCESS_COOKIE, data.access_token, accessCookieOptions);
  res.cookies.set(REFRESH_COOKIE, data.refresh_token, refreshCookieOptions);
  return res;
}
