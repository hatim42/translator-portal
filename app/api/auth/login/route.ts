import { NextResponse } from "next/server";
import {
  ensurePortalDb,
  getPortalDb,
  loginPortalUser,
  sessionCookie,
} from "../../../../db/portal";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json() as Record<string, unknown>;
    const mode = String(body.mode ?? "");
    if (!['owner', 'translator'].includes(mode)) {
      return NextResponse.json({ error: "نوع الحساب غير صحيح" }, { status: 400 });
    }

    const db = getPortalDb();
    await ensurePortalDb(db);
    const session = await loginPortalUser(db, request, {
      mode,
      username: String(body.username ?? ""),
      accessCode: String(body.accessCode ?? ""),
    });
    const response = NextResponse.json({ ok: true });
    response.headers.set("cache-control", "no-store");
    response.headers.append("set-cookie", sessionCookie(session.token));
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تسجيل الدخول";
    const status = message.includes("محاولات دخول كثيرة")
      ? 429
      : message.includes("لم يكتمل إعداد")
        ? 503
        : message.includes("غير صحيحة")
          ? 401
          : 400;
    return NextResponse.json({ error: message }, { status });
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
