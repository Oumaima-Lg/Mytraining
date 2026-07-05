import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  API_INTERNAL_URL,
  accessCookieOptions,
} from "@/lib/auth";

// BFF proxy: forwards /api/proxy/<path> → Flask <path> with the httpOnly
// access token as a Bearer header. On 401, transparently refreshes once.
async function forward(
  req: NextRequest,
  path: string[],
): Promise<NextResponse> {
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  const search = req.nextUrl.search;
  const target = `${API_INTERNAL_URL}/${path.join("/")}${search}`;

  const bodyText =
    req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();

  const doFetch = (token?: string) =>
    fetch(target, {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: bodyText,
    });

  let upstream = await doFetch(access);

  // Attempt one silent refresh on 401.
  let newAccess: string | undefined;
  if (upstream.status === 401 && refresh) {
    const refreshRes = await fetch(`${API_INTERNAL_URL}/auth/refresh`, {
      method: "POST",
      headers: { Authorization: `Bearer ${refresh}` },
    });
    if (refreshRes.ok) {
      newAccess = (await refreshRes.json()).access_token;
      upstream = await doFetch(newAccess);
    }
  }

  const data = await upstream.text();
  const res = new NextResponse(data, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
  if (newAccess) {
    res.cookies.set(ACCESS_COOKIE, newAccess, accessCookieOptions);
  }
  return res;
}

type Ctx = { params: { path: string[] } };

export async function GET(req: NextRequest, { params }: Ctx) {
  return forward(req, params.path);
}
export async function POST(req: NextRequest, { params }: Ctx) {
  return forward(req, params.path);
}
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return forward(req, params.path);
}
export async function DELETE(req: NextRequest, { params }: Ctx) {
  return forward(req, params.path);
}
