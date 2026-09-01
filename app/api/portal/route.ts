import { NextResponse } from "next/server";
import {
  claimTranslatorAccount,
  createPortalRequest,
  decidePortalRequest,
  ensurePortalDb,
  generateInviteCode,
  getOwnerPortal,
  getPortalDb,
  getTranslatorPortal,
  recordAttendance,
  recordDailyStat,
  resetE2eState,
  resolveRequestSession,
  saveDistribution,
  savePreference,
  setRewardStatus,
} from "../../../db/portal";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const db = getPortalDb();
    await ensurePortalDb(db);
    const session = await resolveRequestSession(db, request);
    if (!session) return NextResponse.json({ authenticated: false });
    return NextResponse.json(await payloadForSession(db, session));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const db = getPortalDb();
    await ensurePortalDb(db);
    let session = await resolveRequestSession(db, request);
    if (!session) return NextResponse.json({ error: "يلزم تسجيل الدخول أولاً" }, { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");
    let result: Record<string, unknown> = {};

    switch (action) {
      case "claim-account":
        await claimTranslatorAccount(db, session, String(body.username ?? ""), String(body.code ?? ""));
        session = await resolveRequestSession(db, request);
        if (!session) throw new Error("تعذر تحديث جلسة الحساب");
        break;
      case "generate-invite":
        result = { inviteCode: await generateInviteCode(db, session, Number(body.translatorId)) };
        break;
      case "save-preference":
        await savePreference(
          db,
          session,
          String(body.preferredShift ?? ""),
          String(body.preferredRest ?? ""),
          String(body.note ?? ""),
        );
        break;
      case "create-request":
        await createPortalRequest(db, session, {
          type: String(body.type ?? ""),
          startDate: optionalString(body.startDate),
          endDate: optionalString(body.endDate),
          requestedValue: optionalString(body.requestedValue),
          reason: optionalString(body.reason),
        });
        break;
      case "decide-request":
        await decidePortalRequest(
          db,
          session,
          Number(body.requestId),
          String(body.status ?? ""),
          String(body.ownerNote ?? ""),
        );
        break;
      case "save-distribution":
        await saveDistribution(
          db,
          session,
          Array.isArray(body.assignments) ? body.assignments.map((item) => {
            const value = item as Record<string, unknown>;
            return {
              translatorId: Number(value.translatorId),
              shift: String(value.shift ?? ""),
              restDay: String(value.restDay ?? ""),
            };
          }) : [],
        );
        break;
      case "attendance":
        await recordAttendance(db, session, String(body.kind ?? ""));
        break;
      case "daily-stat":
        await recordDailyStat(
          db,
          session,
          String(body.workDate ?? ""),
          Number(body.beneficiaries),
          Number(body.sessions),
          String(body.note ?? ""),
        );
        break;
      case "set-reward":
        await setRewardStatus(db, session, Number(body.translatorId), String(body.status ?? ""));
        break;
      case "e2e-reset":
        await resetE2eState(db, session);
        session = await resolveRequestSession(db, request);
        if (!session) throw new Error("تعذر تحديث جلسة الاختبار");
        break;
      default:
        return NextResponse.json({ error: "العملية المطلوبة غير معروفة" }, { status: 400 });
    }

    return NextResponse.json({ ...(await payloadForSession(db, session)), ...result });
  } catch (error) {
    return failure(error);
  }
}

async function payloadForSession(db: D1Database, session: NonNullable<Awaited<ReturnType<typeof resolveRequestSession>>>) {
  if (session.role === "owner") return getOwnerPortal(db, session);
  if (session.role === "translator") return getTranslatorPortal(db, session);
  return {
    authenticated: true,
    role: "pending",
    user: session.identity,
  };
}

function optionalString(value: unknown) {
  const result = String(value ?? "").trim();
  return result || undefined;
}

function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  if (new URL(origin).origin !== new URL(request.url).origin) throw new Error("تعذر التحقق من مصدر الطلب");
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "حدث خطأ غير متوقع";
  const status = /غير مسموح|للمالك فقط|للمترجم فقط/.test(message) ? 403 : 400;
  return NextResponse.json({ error: message }, { status });
}
