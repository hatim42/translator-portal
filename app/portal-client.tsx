"use client";

import {
  Activity,
  BarChart3,
  CalendarDays,
  CalendarRange,
  Check,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Copy,
  Download,
  FileClock,
  Inbox,
  KeyRound,
  Languages,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  UserRoundCheck,
  UsersRound,
  WifiOff,
  X,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Role = "owner" | "translator" | "pending";

type PortalUser = {
  userId: string;
  email: string;
  displayName: string;
};

type Person = {
  id: number;
  username: string;
  name: string;
  group_name: string;
  language_group: string;
  primary_language: string;
  shift: string;
  rest_day: string;
  linked: number;
  preferred_shift: string | null;
  preferred_rest: string | null;
  preference_note: string | null;
  submitted_at: string | null;
  reward_status: string;
};

type PortalRequest = {
  id: number;
  translator_id: number;
  name?: string;
  username?: string;
  language_group?: string;
  type: "leave" | "shift" | "rest";
  start_date: string | null;
  end_date: string | null;
  requested_value: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  owner_note: string;
  created_at: string;
  decided_at: string | null;
};

type Preference = {
  preferred_shift: string;
  preferred_rest: string;
  note: string;
  submitted_at: string;
};

type TranslatorRecord = {
  id: number;
  username: string;
  name: string;
  group_name: string;
  language_group: string;
  primary_language: string;
  shift: string;
  rest_day: string;
};

type AttendanceRecord = { id: number; kind: "in" | "out"; occurred_at: string };
type StatRecord = { id: number; work_date: string; beneficiaries: number; sessions: number; note: string };

type OwnerData = {
  authenticated: true;
  role: "owner";
  user: PortalUser;
  cycle: string;
  metrics: { translators: number; submitted: number; pending: number; linked: number };
  people: Person[];
  requests: PortalRequest[];
  audit: Array<{ id: number; action: string; detail: string; created_at: string }>;
  inviteCode?: string;
};

type TranslatorData = {
  authenticated: true;
  role: "translator";
  user: PortalUser;
  cycle: string;
  person: TranslatorRecord;
  preference: Preference | null;
  requests: PortalRequest[];
  attendance: AttendanceRecord[];
  stats: StatRecord[];
  reward: { status: string };
};

type PendingData = { authenticated: true; role: "pending"; user: PortalUser };
type AnonymousData = { authenticated: false };
type PortalData = OwnerData | TranslatorData | PendingData | AnonymousData;

type ActionPayload = Record<string, unknown> & { action: string };
type RunAction = (payload: ActionPayload, message?: string) => Promise<PortalData | null>;
type LoginPayload = { mode: "owner" | "translator"; username?: string; accessCode: string };

const shifts = [
  "الوردية الأولى · 5 م - 11 م",
  "الوردية الثانية · 9 م - 3 ص",
  "وردية مرنة حسب الاحتياج",
];
const restDays = ["الجمعة", "السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];

export default function PortalClient() {
  const [data, setData] = useState<PortalData | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installEvent, setInstallEvent] = useState<Event | null>(null);
  const [installHelp, setInstallHelp] = useState(false);

  useEffect(() => {
    void loadPortal();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => window.removeEventListener("beforeinstallprompt", onInstall);
  }, []);

  async function loadPortal() {
    setError(null);
    try {
      const response = await fetch("/api/portal", { cache: "no-store" });
      const body = await response.json() as PortalData & { error?: string };
      if (!response.ok) throw new Error(body.error || "تعذر تحميل المنصة");
      setData(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل المنصة");
    }
  }

  async function runAction(payload: ActionPayload, successMessage?: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as PortalData & { error?: string; inviteCode?: string };
      if (!response.ok) throw new Error(body.error || "تعذر تنفيذ العملية");
      setData(body);
      if (successMessage) setNotice(successMessage);
      window.setTimeout(() => setNotice(null), 3200);
      return body;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تنفيذ العملية");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function signIn(payload: LoginPayload) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "تعذر تسجيل الدخول");
      await loadPortal();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تسجيل الدخول");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("تعذر تسجيل الخروج");
      setData({ authenticated: false });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تسجيل الخروج");
    } finally {
      setBusy(false);
    }
  }

  async function installApp() {
    if (!installEvent) {
      setInstallHelp(true);
      return;
    }
    const promptEvent = installEvent as Event & { prompt: () => Promise<void> };
    await promptEvent.prompt();
    setInstallEvent(null);
  }

  if (!data) return <LoadingScreen error={error} retry={loadPortal} />;
  if (!data.authenticated) return <SignInScreen busy={busy} error={error} signIn={signIn} />;
  if (data.role === "pending") return <ClaimScreen data={data} busy={busy} runAction={runAction} onSignOut={signOut} />;

  return (
    <>
      {data.role === "owner" ? (
        <OwnerPortal
          data={data}
          busy={busy}
          runAction={runAction}
          onSignOut={signOut}
          installApp={installApp}
        />
      ) : (
        <TranslatorPortal
          data={data}
          busy={busy}
          runAction={runAction}
          onSignOut={signOut}
          installApp={installApp}
        />
      )}
      {notice && <div className="toast success" role="status"><Check size={18} />{notice}</div>}
      {error && <div className="toast error" role="alert"><XCircle size={18} />{error}<button aria-label="إغلاق" onClick={() => setError(null)}><X size={16} /></button></div>}
      {installHelp && <InstallHelp close={() => setInstallHelp(false)} />}
    </>
  );
}

function LoadingScreen({ error, retry }: { error: string | null; retry: () => Promise<void> }) {
  return (
    <main className="center-screen">
      <Image src="/religious-affairs-logo.jpg" alt="رئاسة الشؤون الدينية" className="loading-logo" width={1536} height={906} priority />
      {error ? (
        <div className="loading-message"><WifiOff /><h1>تعذر الاتصال بالمنصة</h1><p>{error}</p><button className="btn primary" onClick={() => void retry()}><RefreshCw size={17} />إعادة المحاولة</button></div>
      ) : (
        <div className="loading-message"><span className="spinner" /><h1>جاري تجهيز مساحة العمل</h1><p>لحظات وتظهر بياناتك المحدثة.</p></div>
      )}
    </main>
  );
}

function SignInScreen({ busy, error, signIn }: { busy: boolean; error: string | null; signIn: (payload: LoginPayload) => Promise<boolean> }) {
  const [mode, setMode] = useState<"owner" | "translator">("translator");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await signIn({
      mode,
      username: mode === "translator" ? String(form.get("username") ?? "") : undefined,
      accessCode: String(form.get("accessCode") ?? ""),
    });
  }

  return (
    <main className="auth-page">
      <section className="auth-brand">
        <Image src="/religious-affairs-logo.jpg" alt="رئاسة الشؤون الدينية بالمسجد الحرام والمسجد النبوي" width={1536} height={906} priority />
        <div><span>وكالة الشؤون الدعوية والإرشادية</span><h1>منصة إدارة المترجمين</h1><p>الورديات والطلبات والإحصاءات والمتابعة في مساحة عمل موحدة.</p></div>
      </section>
      <form className="auth-panel" onSubmit={(event) => void submit(event)}>
        <div className="security-mark"><ShieldCheck size={26} /></div>
        <p className="eyebrow">دخول آمن</p>
        <h2>مرحباً بك</h2>
        <p>اختر نوع الحساب ثم أدخل بيانات الوصول الخاصة بك.</p>
        <div className="segmented auth-modes" aria-label="نوع الحساب">
          <button type="button" className={mode === "translator" ? "active" : ""} aria-pressed={mode === "translator"} onClick={() => setMode("translator")}><Languages size={16} />مترجم</button>
          <button type="button" className={mode === "owner" ? "active" : ""} aria-pressed={mode === "owner"} onClick={() => setMode("owner")}><ShieldCheck size={16} />المالك</button>
        </div>
        {mode === "translator" && <label>اسم المستخدم<input name="username" autoComplete="username" required data-testid="login-username" /></label>}
        <label>{mode === "owner" ? "رمز دخول المالك" : "رمز الدخول"}<input name="accessCode" type="password" autoComplete="current-password" dir="ltr" required data-testid="login-code" /></label>
        {error && <div className="auth-error" role="alert"><XCircle size={17} /><span>{error}</span></div>}
        <button className="btn primary wide" disabled={busy} data-testid="login-submit"><UserRoundCheck size={18} />{busy ? "جاري التحقق..." : "دخول المنصة"}</button>
        <small>{mode === "translator" ? "رمز الدخول الأول يصدره المالك ويُحفظ لديك للدخول لاحقاً." : "رمز المالك محفوظ بصورة مشفرة في بيئة الاستضافة."}</small>
      </form>
    </main>
  );
}

function ClaimScreen({ data, busy, runAction, onSignOut }: { data: PendingData; busy: boolean; runAction: RunAction; onSignOut: () => Promise<void> }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runAction({ action: "claim-account", username: form.get("username"), code: form.get("code") }, "تم ربط حسابك بنجاح");
  }
  return (
    <main className="auth-page">
      <section className="auth-brand compact">
        <Image src="/religious-affairs-logo.jpg" alt="رئاسة الشؤون الدينية" width={1536} height={906} priority />
        <div><span>منصة المترجمين</span><h1>أكمل ربط حسابك</h1><p>هذه الخطوة تُنفذ مرة واحدة فقط.</p></div>
      </section>
      <form className="auth-panel" onSubmit={(event) => void submit(event)}>
        <div className="security-mark"><KeyRound size={25} /></div>
        <p className="eyebrow">مرحباً {data.user.displayName}</p>
        <h2>رمز الدعوة</h2>
        <p>أدخل اسم المستخدم والرمز الذي أصدره لك المالك.</p>
        <label>اسم المستخدم<input name="username" autoComplete="username" required /></label>
        <label>رمز الدعوة<input name="code" autoComplete="one-time-code" dir="ltr" required /></label>
        <button className="btn primary wide" disabled={busy}><CheckCircle2 size={18} />ربط الحساب</button>
        <button className="text-link plain-button" type="button" onClick={() => void onSignOut()}>الدخول بحساب مختلف</button>
      </form>
    </main>
  );
}

function AppFrame({
  role,
  name,
  subtitle,
  active,
  setActive,
  nav,
  onSignOut,
  installApp,
  children,
}: {
  role: Role;
  name: string;
  subtitle: string;
  active: string;
  setActive: (value: string) => void;
  nav: Array<{ id: string; label: string; icon: typeof LayoutDashboard }>;
  onSignOut: () => Promise<void>;
  installApp: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="icon-btn mobile-menu" aria-label="فتح القائمة" onClick={() => setMenuOpen(!menuOpen)}><Menu /></button>
        <div className="header-brand"><Image src="/religious-affairs-logo.jpg" alt="رئاسة الشؤون الدينية" width={1536} height={906} /><div><strong>منصة المترجمين</strong><small>وكالة الشؤون الدعوية والإرشادية</small></div></div>
        <div className="header-actions">
          <button className="icon-btn" aria-label="تثبيت التطبيق" title="تثبيت التطبيق" onClick={() => void installApp()}><Download /></button>
          <button className="icon-btn" aria-label="تسجيل الخروج" title="تسجيل الخروج" onClick={() => void onSignOut()}><LogOut /></button>
          <div className="user-chip"><span>{initials(name)}</span><div><strong data-testid="user-name">{name}</strong><small>{subtitle}</small></div></div>
        </div>
      </header>
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="sidebar-role"><ShieldCheck size={18} /><span>{role === "owner" ? "لوحة المالك" : "مساحة المترجم"}</span></div>
        <nav>{nav.map((item) => <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => { setActive(item.id); setMenuOpen(false); }}><item.icon /><span>{item.label}</span></button>)}</nav>
        <button className="install-link" onClick={() => void installApp()}><Smartphone /><span>تثبيت كتطبيق</span></button>
      </aside>
      {menuOpen && <button className="menu-backdrop" aria-label="إغلاق القائمة" onClick={() => setMenuOpen(false)} />}
      <main className="workspace">{children}</main>
      <nav className="bottom-nav">{nav.slice(0, 4).map((item) => <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => setActive(item.id)}><item.icon /><span>{item.label}</span></button>)}</nav>
    </div>
  );
}

function OwnerPortal({ data, busy, runAction, onSignOut, installApp }: { data: OwnerData; busy: boolean; runAction: RunAction; onSignOut: () => Promise<void>; installApp: () => Promise<void> }) {
  const [active, setActive] = useState("overview");
  const [invite, setInvite] = useState<{ name: string; code: string } | null>(null);
  const nav = [
    { id: "overview", label: "نظرة عامة", icon: LayoutDashboard },
    { id: "requests", label: "الطلبات", icon: Inbox },
    { id: "distribution", label: "التوزيع", icon: CalendarRange },
    { id: "people", label: "المترجمون", icon: UsersRound },
    { id: "audit", label: "سجل الإجراءات", icon: ClipboardCheck },
  ];

  async function generateInvite(person: Person) {
    if (person.linked && !window.confirm(`سيتم تسجيل خروج ${person.name} وإلغاء رمزه السابق. هل تريد المتابعة؟`)) return;
    const body = await runAction({ action: "generate-invite", translatorId: person.id });
    const code = body?.role === "owner" ? body.inviteCode : undefined;
    if (code) setInvite({ name: person.name, code });
  }

  return (
    <AppFrame role="owner" name={data.user.displayName} subtitle="المالك" active={active} setActive={setActive} nav={nav} onSignOut={onSignOut} installApp={installApp}>
      {active === "overview" && <OwnerOverview data={data} setActive={setActive} runAction={runAction} busy={busy} />}
      {active === "requests" && <OwnerRequests requests={data.requests} runAction={runAction} busy={busy} />}
      {active === "distribution" && <Distribution people={data.people} runAction={runAction} busy={busy} />}
      {active === "people" && <People people={data.people} runAction={runAction} generateInvite={generateInvite} busy={busy} />}
      {active === "audit" && <AuditLog rows={data.audit} />}
      {invite && <InviteModal invite={invite} close={() => setInvite(null)} />}
    </AppFrame>
  );
}

function OwnerOverview({ data, setActive, runAction, busy }: { data: OwnerData; setActive: (id: string) => void; runAction: RunAction; busy: boolean }) {
  const pending = data.requests.filter((item) => item.status === "pending").slice(0, 5);
  const percent = Math.round((data.metrics.submitted / Math.max(data.metrics.translators, 1)) * 100);
  const languageSummary = useMemo(() => {
    const counts = new Map<string, number>();
    data.people.forEach((person) => counts.set(person.language_group, (counts.get(person.language_group) ?? 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [data.people]);
  return (
    <>
      <PageHeading eyebrow={`دورة ${formatCycle(data.cycle)}`} title="مركز المتابعة" description="صورة تنفيذية فورية لحالة الفريق والطلبات قبل اعتماد التوزيع." />
      <section className="metrics" aria-label="مؤشرات المنصة">
        <Metric icon={UsersRound} label="المترجمون" value={data.metrics.translators} note="أساسي ومساند" tone="green" />
        <Metric icon={ClipboardList} label="الرغبات المستلمة" value={`${data.metrics.submitted}/${data.metrics.translators}`} note={`${percent}% من الفريق`} tone="blue" />
        <Metric icon={FileClock} label="بانتظار القرار" value={data.metrics.pending} note="طلبات تحتاج مراجعة" tone="gold" />
        <Metric icon={UserRoundCheck} label="حسابات مربوطة" value={`${data.metrics.linked}/${data.metrics.translators}`} note="تم التحقق من هويتها" tone="rose" />
      </section>
      <div className="overview-grid">
        <section className="panel queue-panel">
          <div className="section-head"><div><p className="eyebrow">الأولوية الآن</p><h2>الطلبات المعلقة</h2></div><button className="btn ghost" onClick={() => setActive("requests")}>عرض الكل</button></div>
          {pending.length ? <div className="request-stack">{pending.map((request) => <RequestRow key={request.id} request={request} owner runAction={runAction} busy={busy} compact />)}</div> : <EmptyState icon={CheckCircle2} title="لا توجد طلبات معلقة" text="جميع الطلبات الحالية تمت معالجتها." />}
        </section>
        <section className="panel language-panel">
          <div className="section-head"><div><p className="eyebrow">توازن الفريق</p><h2>أكبر مجموعات اللغات</h2></div><Languages /></div>
          <div className="language-list">{languageSummary.map(([language, count]) => <div key={language}><span>{language.replace(" / ", " و")}</span><div><i style={{ width: `${Math.max(12, count / data.metrics.translators * 100)}%` }} /></div><b>{count}</b></div>)}</div>
        </section>
      </div>
    </>
  );
}

function OwnerRequests({ requests, runAction, busy }: { requests: PortalRequest[]; runAction: RunAction; busy: boolean }) {
  const [filter, setFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const rows = requests.filter((request) => (filter === "all" || request.status === filter) && `${request.name} ${request.reason} ${request.language_group}`.includes(search));
  return (
    <>
      <PageHeading eyebrow="سير الاعتماد" title="طلبات المترجمين" description="راجع الإجازات وتغييرات الوردية والراحة، واتخذ القرار من نفس السجل." actions={<span className="count-chip">{rows.length} طلب</span>} />
      <section className="toolbar"><div className="search-field"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم أو السبب..." /></div><div className="segmented">{[["pending", "المعلقة"], ["approved", "المعتمدة"], ["rejected", "المرفوضة"], ["all", "الكل"]].map(([id, label]) => <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{label}</button>)}</div></section>
      <section className="panel request-list">{rows.length ? rows.map((request) => <RequestRow key={request.id} request={request} owner runAction={runAction} busy={busy} />) : <EmptyState icon={Inbox} title="لا توجد نتائج" text="غيّر الفلتر أو عبارة البحث." />}</section>
    </>
  );
}

function Distribution({ people, runAction, busy }: { people: Person[]; runAction: RunAction; busy: boolean }) {
  const [search, setSearch] = useState("");
  const rows = people.filter((person) => `${person.name} ${person.language_group} ${person.primary_language}`.includes(search));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const assignments = people.map((person) => ({
      translatorId: person.id,
      shift: String(form.get(`shift:${person.id}`) ?? person.shift),
      restDay: String(form.get(`rest:${person.id}`) ?? person.rest_day),
    }));
    await runAction({ action: "save-distribution", assignments }, "تم حفظ التوزيع وترحيله للفريق");
  }
  return (
    <>
      <PageHeading eyebrow="التوزيع التشغيلي" title="الورديات وأيام الراحة" description="الرغبة تظهر بجوار التوزيع الحالي حتى يكون القرار واضحاً قبل الحفظ." />
      <div className="distribution-note"><ShieldCheck /><div><strong>حفظ موحد</strong><p>لن يُطبق أي تعديل على المترجمين إلا بعد الضغط على حفظ التوزيع.</p></div></div>
      <form onSubmit={(event) => void submit(event)}>
        <section className="toolbar"><div className="search-field"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم أو اللغة..." /></div><button className="btn primary" disabled={busy}><CheckCircle2 />حفظ التوزيع</button></section>
        <section className="panel table-panel"><div className="data-table distribution-table"><div className="table-row table-head"><span>المترجم</span><span>الرغبة المسجلة</span><span>الوردية المعتمدة</span><span>الراحة</span></div>{rows.map((person) => <div className="table-row" key={person.id} data-testid={`distribution-${person.username}`}><span className="person-cell"><i>{initials(person.name)}</i><span><b>{person.name}</b><small>{person.language_group.replace(" / ", " و")} · {person.group_name}</small></span></span><span className="preference-cell">{person.submitted_at ? <><b>{person.preferred_shift}</b><small>{person.preferred_rest}</small></> : <em>لم يسجل رغبته</em>}</span><span><select name={`shift:${person.id}`} defaultValue={person.shift}>{shifts.map((shift) => <option key={shift}>{shift}</option>)}</select></span><span><select name={`rest:${person.id}`} defaultValue={person.rest_day}>{restDays.map((day) => <option key={day}>{day}</option>)}</select></span></div>)}</div></section>
      </form>
    </>
  );
}

function People({ people, runAction, generateInvite, busy }: { people: Person[]; runAction: RunAction; generateInvite: (person: Person) => Promise<void>; busy: boolean }) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const rows = people.filter((person) => (group === "all" || person.group_name === group) && `${person.name} ${person.username} ${person.language_group}`.includes(search));
  return (
    <>
      <PageHeading eyebrow="الحسابات والفريق" title="دليل المترجمين" description="إدارة الربط الآمن وحالة المكافأة دون كلمات مرور محفوظة في المصدر." actions={<span className="count-chip">{rows.length} مترجماً</span>} />
      <section className="toolbar"><div className="search-field"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="الاسم، المستخدم، اللغة..." /></div><div className="segmented"><button className={group === "all" ? "active" : ""} onClick={() => setGroup("all")}>الكل</button><button className={group === "أساسي" ? "active" : ""} onClick={() => setGroup("أساسي")}>أساسي</button><button className={group === "مساند" ? "active" : ""} onClick={() => setGroup("مساند")}>مساند</button></div></section>
      <section className="people-grid">{rows.map((person) => <article className="person-card" key={person.id}><div className="person-card-top"><span className="avatar">{initials(person.name)}</span><div><h3>{person.name}</h3><p>@{person.username}</p></div><StatusPill status={person.linked ? "linked" : "unlinked"} /></div><dl><div><dt>اللغة</dt><dd>{person.primary_language}</dd></div><div><dt>المجموعة</dt><dd>{person.group_name}</dd></div><div><dt>الوردية</dt><dd>{shortShift(person.shift)}</dd></div><div><dt>الراحة</dt><dd>{person.rest_day}</dd></div></dl><div className="person-card-actions"><button className="btn outline" disabled={busy} onClick={() => void generateInvite(person)}><KeyRound />{person.linked ? "إعادة إصدار الرمز" : "إنشاء رمز"}</button><select aria-label={`حالة مكافأة ${person.name}`} value={person.reward_status} onChange={(event) => void runAction({ action: "set-reward", translatorId: person.id, status: event.target.value }, "تم تحديث حالة المكافأة")}><option value="pending">المكافأة: قيد المراجعة</option><option value="paid">المكافأة: تم الصرف</option><option value="on_hold">المكافأة: معلقة</option></select></div></article>)}</section>
    </>
  );
}

function AuditLog({ rows }: { rows: OwnerData["audit"] }) {
  return (
    <>
      <PageHeading eyebrow="الحوكمة" title="سجل الإجراءات" description="أحدث العمليات الحساسة التي تمت داخل المنصة للرجوع والمراجعة." />
      <section className="panel timeline">{rows.length ? rows.map((row) => <div key={row.id}><span><Activity /></span><div><strong>{auditLabel(row.action)}</strong><p>{row.detail || "بدون تفاصيل إضافية"}</p><small>{formatDateTime(row.created_at)}</small></div></div>) : <EmptyState icon={ClipboardCheck} title="السجل فارغ" text="ستظهر هنا عمليات الاعتماد والتوزيع." />}</section>
    </>
  );
}

function TranslatorPortal({ data, busy, runAction, onSignOut, installApp }: { data: TranslatorData; busy: boolean; runAction: RunAction; onSignOut: () => Promise<void>; installApp: () => Promise<void> }) {
  const [active, setActive] = useState("today");
  const nav = [
    { id: "today", label: "اليوم", icon: LayoutDashboard },
    { id: "preference", label: "رغبتي", icon: CalendarDays },
    { id: "requests", label: "طلباتي", icon: Inbox },
    { id: "records", label: "التسجيل", icon: BarChart3 },
  ];
  return (
    <AppFrame role="translator" name={data.person.name} subtitle={`${data.person.primary_language} · ${data.person.group_name}`} active={active} setActive={setActive} nav={nav} onSignOut={onSignOut} installApp={installApp}>
      {active === "today" && <TranslatorToday data={data} setActive={setActive} runAction={runAction} busy={busy} />}
      {active === "preference" && <PreferenceForm data={data} runAction={runAction} busy={busy} />}
      {active === "requests" && <TranslatorRequests data={data} runAction={runAction} busy={busy} />}
      {active === "records" && <Records data={data} runAction={runAction} busy={busy} />}
    </AppFrame>
  );
}

function TranslatorToday({ data, setActive, runAction, busy }: { data: TranslatorData; setActive: (id: string) => void; runAction: RunAction; busy: boolean }) {
  const lastAttendance = data.attendance[0];
  const pending = data.requests.filter((request) => request.status === "pending").length;
  return (
    <>
      <PageHeading eyebrow={arabicToday()} title={`مرحباً، ${firstName(data.person.name)}`} description="هذه ورديتك وحالة معاملاتك لليوم." />
      <section className="shift-band"><div><p>وردية اليوم</p><h2>{data.person.shift}</h2><span><Clock3 />الراحة الأسبوعية: {data.person.rest_day}</span></div><CalendarDays /></section>
      <section className="metrics translator-metrics">
        <Metric icon={CalendarRange} label="رغبة الشهر" value={data.preference ? "مسجلة" : "غير مسجلة"} note={data.preference ? formatDateTime(data.preference.submitted_at) : "أكملها قبل التوزيع"} tone={data.preference ? "green" : "gold"} />
        <Metric icon={Inbox} label="طلبات معلقة" value={pending} note="يمكن متابعة القرار" tone="blue" />
        <Metric icon={CircleDollarSign} label="المكافأة" value={rewardLabel(data.reward.status)} note={`دورة ${formatCycle(data.cycle)}`} tone="rose" />
        <Metric icon={Clock3} label="آخر حضور" value={lastAttendance ? attendanceLabel(lastAttendance.kind) : "لم يسجل"} note={lastAttendance ? formatDateTime(lastAttendance.occurred_at) : "سجل عند بداية الوردية"} tone="green" />
      </section>
      <section className="quick-actions"><button onClick={() => void runAction({ action: "attendance", kind: "in" }, "تم تسجيل الحضور")} disabled={busy}><span><UserRoundCheck /></span><b>تسجيل الحضور</b><small>إثبات بداية الوردية</small></button><button onClick={() => setActive("preference")}><span><CalendarDays /></span><b>تسجيل الرغبة</b><small>الوردية ويوم الراحة</small></button><button onClick={() => setActive("requests")}><span><Plus /></span><b>رفع طلب</b><small>إجازة أو تغيير توزيع</small></button><button onClick={() => setActive("records")}><span><BarChart3 /></span><b>الإحصاء اليومي</b><small>المستفيدون والجلسات</small></button></section>
    </>
  );
}

function PreferenceForm({ data, runAction, busy }: { data: TranslatorData; runAction: RunAction; busy: boolean }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runAction({ action: "save-preference", preferredShift: form.get("preferredShift"), preferredRest: form.get("preferredRest"), note: form.get("note") }, "تم حفظ رغبتك للشهر الحالي");
  }
  return (
    <>
      <PageHeading eyebrow={`دورة ${formatCycle(data.cycle)}`} title="رغبة الوردية والراحة" description="سجل اختيارك قبل إعداد التوزيع. يمكنك تحديثه ما دام الشهر مفتوحاً." />
      <form className="form-panel" onSubmit={(event) => void submit(event)} data-testid="preference-form">
        <div className="form-intro"><CalendarDays /><div><h2>اختيارات الشهر</h2><p>الرغبة لا تغيّر التوزيع مباشرة؛ تظهر للمالك أثناء الاعتماد.</p></div></div>
        <div className="form-grid"><label>الوردية المفضلة<select name="preferredShift" defaultValue={data.preference?.preferred_shift ?? data.person.shift} data-testid="preferred-shift">{shifts.map((shift) => <option key={shift}>{shift}</option>)}</select></label><label>يوم الراحة المفضل<select name="preferredRest" defaultValue={data.preference?.preferred_rest ?? data.person.rest_day} data-testid="preferred-rest">{restDays.map((day) => <option key={day}>{day}</option>)}</select></label></div>
        <label>ملاحظة للمالك<textarea name="note" defaultValue={data.preference?.note ?? ""} placeholder="اختياري: اذكر ظرفاً يؤثر على التوزيع" /></label>
        <div className="form-actions"><button className="btn primary" disabled={busy} data-testid="save-preference"><Send />حفظ الرغبة</button>{data.preference && <span className="saved-note"><CheckCircle2 />آخر تحديث: {formatDateTime(data.preference.submitted_at)}</span>}</div>
      </form>
    </>
  );
}

function TranslatorRequests({ data, runAction, busy }: { data: TranslatorData; runAction: RunAction; busy: boolean }) {
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState("leave");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await runAction({ action: "create-request", type, startDate: form.get("startDate"), endDate: form.get("endDate"), requestedValue: form.get("requestedValue"), reason: form.get("reason") }, "تم إرسال الطلب للمالك");
    if (result) setShowForm(false);
  }
  return (
    <>
      <PageHeading eyebrow="المعاملات" title="طلباتي" description="طلب إجازة أو تغيير وردية أو يوم راحة ومتابعة القرار." actions={<button className="btn primary" onClick={() => setShowForm(true)} data-testid="new-request"><Plus />طلب جديد</button>} />
      {showForm && <form className="form-panel request-form" onSubmit={(event) => void submit(event)} data-testid="request-form"><div className="form-intro"><ClipboardList /><div><h2>رفع طلب جديد</h2><p>أكمل البيانات بوضوح لتسريع المعالجة.</p></div><button className="icon-btn" type="button" aria-label="إغلاق" onClick={() => setShowForm(false)}><X /></button></div><div className="form-grid"><label>نوع الطلب<select value={type} onChange={(event) => setType(event.target.value)} data-testid="request-type"><option value="leave">إجازة</option><option value="shift">تغيير الوردية</option><option value="rest">تغيير الراحة الأسبوعية</option></select></label>{type === "leave" ? <><label>من تاريخ<input name="startDate" type="date" required /></label><label>إلى تاريخ<input name="endDate" type="date" required /></label></> : <label>{type === "shift" ? "الوردية المطلوبة" : "يوم الراحة المطلوب"}<select name="requestedValue" required>{(type === "shift" ? shifts : restDays).map((value) => <option key={value}>{value}</option>)}</select></label>}</div><label>سبب الطلب<textarea name="reason" minLength={5} required placeholder="اكتب السبب باختصار ووضوح" data-testid="request-reason" /></label><div className="form-actions"><button className="btn primary" disabled={busy} data-testid="submit-request"><Send />إرسال الطلب</button><button className="btn ghost" type="button" onClick={() => setShowForm(false)}>إلغاء</button></div></form>}
      <section className="panel request-list">{data.requests.length ? data.requests.map((request) => <RequestRow key={request.id} request={request} />) : <EmptyState icon={Inbox} title="لا توجد طلبات" text="ستظهر معاملاتك هنا بعد إرسال أول طلب." />}</section>
    </>
  );
}

function Records({ data, runAction, busy }: { data: TranslatorData; runAction: RunAction; busy: boolean }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runAction({ action: "daily-stat", workDate: form.get("workDate"), beneficiaries: Number(form.get("beneficiaries")), sessions: Number(form.get("sessions")), note: form.get("note") }, "تم حفظ الإحصاء اليومي");
  }
  return (
    <>
      <PageHeading eyebrow="السجل اليومي" title="الحضور والإحصاء" description="سجل بداية ونهاية الوردية وعدد المستفيدين من عملك." />
      <div className="record-grid"><section className="form-panel"><div className="form-intro"><Clock3 /><div><h2>الحضور والانصراف</h2><p>آخر العمليات تظهر في السجل أدناه.</p></div></div><div className="attendance-actions"><button className="btn primary" disabled={busy} onClick={() => void runAction({ action: "attendance", kind: "in" }, "تم تسجيل الحضور")}><UserRoundCheck />تسجيل حضور</button><button className="btn outline" disabled={busy} onClick={() => void runAction({ action: "attendance", kind: "out" }, "تم تسجيل الانصراف")}><LogOut />تسجيل انصراف</button></div><div className="compact-list">{data.attendance.slice(0, 6).map((record) => <div key={record.id}><span className={record.kind === "in" ? "dot green" : "dot gold"} /><b>{attendanceLabel(record.kind)}</b><small>{formatDateTime(record.occurred_at)}</small></div>)}</div></section><form className="form-panel" onSubmit={(event) => void submit(event)} data-testid="stats-form"><div className="form-intro"><BarChart3 /><div><h2>الإحصاء اليومي</h2><p>يمكنك تحديث إحصاء اليوم نفسه.</p></div></div><div className="form-grid"><label>التاريخ<input type="date" name="workDate" defaultValue={todayIso()} required /></label><label>عدد المستفيدين<input type="number" name="beneficiaries" min="0" max="100000" required /></label><label>الجلسات أو الجولات<input type="number" name="sessions" min="0" max="1000" required /></label></div><label>ملاحظة<textarea name="note" placeholder="اختياري" /></label><button className="btn primary" disabled={busy}><CheckCircle2 />حفظ الإحصاء</button></form></div>
      <section className="panel"><div className="section-head"><div><p className="eyebrow">آخر التسجيلات</p><h2>سجل الإحصاءات</h2></div></div>{data.stats.length ? <div className="stats-list">{data.stats.map((record) => <div key={record.id}><span><b>{record.work_date}</b><small>{record.note || "بدون ملاحظات"}</small></span><span><strong>{record.beneficiaries}</strong><small>مستفيد</small></span><span><strong>{record.sessions}</strong><small>جلسة</small></span></div>)}</div> : <EmptyState icon={BarChart3} title="لا توجد إحصاءات" text="أضف إحصاء اليوم من النموذج أعلاه." />}</section>
    </>
  );
}

function RequestRow({ request, owner = false, runAction, busy = false, compact = false }: { request: PortalRequest; owner?: boolean; runAction?: RunAction; busy?: boolean; compact?: boolean }) {
  const details = request.type === "leave" ? `${request.start_date} - ${request.end_date}` : request.requested_value;
  return (
    <article className={`request-row ${compact ? "compact" : ""}`} data-testid={`request-${request.id}`}>
      <div className="request-icon">{request.type === "leave" ? <CalendarDays /> : request.type === "shift" ? <Clock3 /> : <CalendarRange />}</div>
      <div className="request-main"><div><h3>{owner ? request.name : requestTypeLabel(request.type)}</h3>{owner && <span>{request.language_group}</span>}</div><p><b>{requestTypeLabel(request.type)}</b> · {details}</p><small>{request.reason}</small></div>
      <div className="request-meta"><StatusPill status={request.status} /><time>{formatDateTime(request.created_at)}</time></div>
      {owner && request.status === "pending" && runAction && <div className="request-actions"><button className="icon-action approve" title="اعتماد" aria-label={`اعتماد طلب ${request.name}`} disabled={busy} onClick={() => void runAction({ action: "decide-request", requestId: request.id, status: "approved", ownerNote: "" }, "تم اعتماد الطلب")} data-testid={`approve-${request.id}`}><Check /></button><button className="icon-action reject" title="رفض" aria-label={`رفض طلب ${request.name}`} disabled={busy} onClick={() => void runAction({ action: "decide-request", requestId: request.id, status: "rejected", ownerNote: "" }, "تم رفض الطلب")}><X /></button></div>}
    </article>
  );
}

function Metric({ icon: Icon, label, value, note, tone }: { icon: typeof UsersRound; label: string; value: string | number; note: string; tone: string }) {
  return <article className={`metric ${tone}`}><span><Icon /></span><div><p>{label}</p><strong>{value}</strong><small>{note}</small></div></article>;
}

function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return <header className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{actions && <div className="heading-actions">{actions}</div>}</header>;
}

function EmptyState({ icon: Icon, title, text }: { icon: typeof Inbox; title: string; text: string }) {
  return <div className="empty-state"><Icon /><h3>{title}</h3><p>{text}</p></div>;
}

function StatusPill({ status }: { status: string | number }) {
  const labels: Record<string, string> = { pending: "معلّق", approved: "معتمد", rejected: "مرفوض", linked: "مربوط", unlinked: "غير مربوط" };
  const key = String(status);
  return <span className={`status-pill ${key}`}>{labels[key] ?? key}</span>;
}

function InviteModal({ invite, close }: { invite: { name: string; code: string }; close: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copyCode() {
    await navigator.clipboard.writeText(invite.code);
    setCopied(true);
  }
  return <div className="modal" role="dialog" aria-modal="true" aria-labelledby="invite-title"><button className="modal-backdrop" aria-label="إغلاق" onClick={close} /><section className="modal-card"><div className="modal-icon"><KeyRound /></div><button className="icon-btn modal-close" aria-label="إغلاق" onClick={close}><X /></button><p className="eyebrow">يظهر مرة واحدة</p><h2 id="invite-title">رمز دخول {invite.name}</h2><p>أرسل الرمز للمترجم عبر قناة آمنة. سيستخدمه للدخول، وإصدار رمز جديد يلغي السابق.</p><div className="invite-code" dir="ltr" data-testid="invite-code">{invite.code}</div><button className="btn primary wide" onClick={() => void copyCode()}>{copied ? <Check /> : <Copy />}{copied ? "تم النسخ" : "نسخ الرمز"}</button></section></div>;
}

function InstallHelp({ close }: { close: () => void }) {
  return <div className="modal" role="dialog" aria-modal="true" aria-labelledby="install-title"><button className="modal-backdrop" aria-label="إغلاق" onClick={close} /><section className="modal-card"><div className="modal-icon"><Smartphone /></div><button className="icon-btn modal-close" aria-label="إغلاق" onClick={close}><X /></button><p className="eyebrow">تثبيت سريع</p><h2 id="install-title">أضف المنصة للشاشة الرئيسية</h2><ol><li><b>آيفون:</b> افتح قائمة المشاركة ثم اختر «إضافة إلى الشاشة الرئيسية».</li><li><b>أندرويد:</b> افتح قائمة المتصفح ثم اختر «تثبيت التطبيق».</li><li><b>الكمبيوتر:</b> اضغط رمز التثبيت بجوار شريط العنوان.</li></ol><button className="btn primary wide" onClick={close}>تم</button></section></div>;
}

function requestTypeLabel(type: string) { return ({ leave: "إجازة", shift: "تغيير الوردية", rest: "تغيير الراحة" } as Record<string, string>)[type] ?? type; }
function rewardLabel(status: string) { return ({ paid: "تم الصرف", on_hold: "معلقة", pending: "قيد المراجعة" } as Record<string, string>)[status] ?? status; }
function attendanceLabel(kind: string) { return kind === "in" ? "حضور" : "انصراف"; }
function auditLabel(action: string) { return ({ claim_account: "ربط حساب مترجم", generate_invite: "إنشاء رمز دعوة", submit_preference: "تسجيل رغبة", create_request: "رفع طلب", decide_request: "قرار على طلب", save_distribution: "حفظ التوزيع", attendance: "تسجيل حضور", daily_stat: "حفظ إحصاء", set_reward: "تحديث مكافأة" } as Record<string, string>)[action] ?? action; }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join(""); }
function firstName(name: string) { return name.split(/\s+/)[0]; }
function shortShift(value: string) { return value.replace("الوردية الأولى · ", "").replace("الوردية الثانية · ", ""); }
function formatCycle(value: string) { const [year, month] = value.split("-").map(Number); return new Intl.DateTimeFormat("ar-SA", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
function arabicToday() { return new Intl.DateTimeFormat("ar-SA", { weekday: "long", day: "numeric", month: "long" }).format(new Date()); }
function todayIso() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
