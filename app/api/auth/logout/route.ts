import { NextResponse } from "next/server";
import {
  destroyPortalSession,
  ensurePortalDb,
  expiredSessionCookie,
  getPortalDb,
} from "../../../../db/portal";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const db = getPortalDb();
    await ensurePortalDb(db);
    await destroyPortalSession(db, request);
    const response = NextResponse.json({ ok: true });
    response.headers.set("cache-control", "no-store");
    response.headers.append("set-cookie", expiredSessionCookie());
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تسجيل الخروج";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function assertSameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new Error("تعذر التحقق من مصدر الطلب");
  }
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).origin !== new URL(request.url).origin) {
    throw new Error("تعذر التحقق من مصدر الطلب");
  }
}
