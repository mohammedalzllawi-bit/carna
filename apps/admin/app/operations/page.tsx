'use client';
import { ArrowRight, Check, CreditCard, FileText, Inbox, LoaderCircle, Pencil, RefreshCw, Save, Star, X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';

type Subscription = { id: string; userId: string; user: { fullName: string; phone: string }; plan: { name: string; auctionLimit: number | null }; status: string; usedAuctions: number; endsAt: string | null };
type Plan = { id: string; name: string; audience: string; permissions: string[] };
type User = { id: string; fullName: string; phone: string };
type Content = { slug: string; locale: string; title: string; body: string; status: string; updatedAt: string };
type Withdrawal = { id: string; userId: string; amountLyd: number; status: string; reason: string; transferReference: string | null };
type RequestRow = { id: string; status: string; createdAt: string; requesterId: string; sellerId?: string; technician?: { name: string }; vehicle?: { make: string; model: string }; priceLyd?: number; message?: string; notes?: string };
type Review = { id: string; rating: number; comment: string | null; isHidden: boolean; reviewer: { fullName: string }; dealer?: { name: string }; technician?: { name: string } };
const tabs = { subscriptions: ['اشتراكات النشر', CreditCard], content: ['الشروط والسياسات', FileText], requests: ['الطلبات', Inbox], withdrawals: ['استرداد المحفظة', CreditCard], reviews: ['التقييمات', Star] } as const;
type Tab = keyof typeof tabs;
const status: Record<string, string> = { Active: 'فعّال', Pending: 'بانتظار المراجعة', Cancelled: 'ملغى', Suspended: 'موقوف', Expired: 'منتهي', Paid: 'مدفوع', Rejected: 'مرفوض', Completed: 'مكتمل', Delivered: 'بانتظار تأكيد المشتري', Accepted: 'مقبول', ReportSubmitted: 'التقرير جاهز', InProgress: 'قيد التنفيذ', Scheduled: 'مجدول', PaymentPending: 'بانتظار الدفع' };
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/admin/${path}`, { ...init, headers: { 'content-type': 'application/json', ...init?.headers }, cache: 'no-store' });
  if (response.status === 401) { location.href = '/login'; throw new Error('انتهت الجلسة'); }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message ?? 'تعذر الاتصال بالخادم');
  return body as T;
}
export default function OperationsPage() {
  const [tab, setTab] = useState<Tab>('subscriptions');
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]), [plans, setPlans] = useState<Plan[]>([]), [users, setUsers] = useState<User[]>([]);
  const [contents, setContents] = useState<Content[]>([]), [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]), [reviews, setReviews] = useState<Review[]>([]);
  const [requests, setRequests] = useState<{ sales: RequestRow[]; inspections: RequestRow[] }>({ sales: [], inspections: [] });
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(''), [userId, setUserId] = useState(''), [planId, setPlanId] = useState(''), [reason, setReason] = useState('');
  const [content, setContent] = useState({ slug: 'terms', locale: 'ar', title: '', body: '', published: false });
  const [edit, setEdit] = useState<Review | null>(null), [reviewReason, setReviewReason] = useState('');
  async function load(view: Tab) {
    setLoading(true); setError('');
    try {
      if (view === 'subscriptions') {
        const items = await request<Subscription[]>('subscriptions'); setSubscriptions(items);
        setPlans((await request<Plan[]>('dealers/plans')).filter((p) => ['Customer', 'Both'].includes(p.audience) && p.permissions.includes('CAN_CREATE_AUCTION')));
        const response = await request<User[] | { items: User[] }>('users'); setUsers(Array.isArray(response) ? response : response.items);
      } else if (view === 'content') setContents(await request<Content[]>('content'));
      else if (view === 'withdrawals') setWithdrawals(await request<Withdrawal[]>('wallet/withdrawals'));
      else if (view === 'reviews') setReviews(await request<Review[]>('reviews'));
      else setRequests(await request<{ sales: RequestRow[]; inspections: RequestRow[] }>('requests'));
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر التحميل'); }
    finally { setLoading(false); }
  }
  useEffect(() => { const view = new URLSearchParams(location.search).get('view'); if (view && Object.hasOwn(tabs, view)) setTab(view as Tab); }, []);
  useEffect(() => { void load(tab); }, [tab]);
  async function mutate(path: string, data: unknown, method = 'POST') {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await request(path, { method, body: JSON.stringify(data) }); await load(tab); setNotice('تم الحفظ وتسجيل الإجراء في سجل التدقيق.'); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر الحفظ'); return false; }
    finally { setBusy(false); }
  }
  async function manage(s: Subscription, action: string) {
    const why = prompt('سبب الإجراء (يحفظ في السجل)'); if (!why || why.trim().length < 3) return;
    const value = ['extend', 'set_usage'].includes(action) ? Number(prompt(action === 'extend' ? 'عدد أيام التمديد' : 'عدد المزادات المستخدمة')) : undefined;
    if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > 3650)) return;
    await mutate('subscriptions', { subscriptionId: s.id, userId: s.userId, action, reason: why, value });
  }
  async function resolve(w: Withdrawal, action: 'paid' | 'reject') {
    const why = prompt('سبب القرار'); if (!why || why.trim().length < 3) return;
    const transferReference = action === 'paid' ? prompt('مرجع التحويل الفعلي بعد تنفيذه') : undefined;
    if (action === 'paid' && !transferReference) return;
    await mutate(`wallet/withdrawals/${w.id}`, { action, reason: why, transferReference });
  }
  return <main className="management-page"><header className="management-header"><div><a href="/"><ArrowRight size={17} /> لوحة الإدارة</a><h1>{tabs[tab][0]}</h1></div><button className="secondary-button" onClick={() => void load(tab)} disabled={busy}><RefreshCw size={17} /> تحديث</button></header>
    <nav className="operations-tabs" aria-label="عمليات المنصة">{Object.entries(tabs).map(([key, [label, Icon]]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key as Tab)}><Icon size={17} />{label}</button>)}</nav>
    {error && <p className="notice-error" role="alert">{error}</p>}{notice && <p className="notice-success" role="status">{notice}</p>}{loading && <p><LoaderCircle className="spin" size={18} /> جارٍ التحميل</p>}
    {tab === 'subscriptions' && <><div className="operations-links"><a href="/dealers">إدارة الباقات والأسعار والصلاحيات والمعارض</a><a href="/settings">إلزام الاشتراك ورسوم المزاد</a></div>
      <form className="operations-form" onSubmit={(e: FormEvent) => { e.preventDefault(); void mutate('subscriptions', { action: 'activate', userId, planId, reason }); }}>
        <h2>منح اشتراك نشر</h2><label className="form-field"><span>ابحث عن المستخدم</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="الاسم أو الهاتف" /></label>
        <label className="form-field"><span>المستخدم</span><select required value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">اختر المستخدم</option>{users.filter((u) => `${u.fullName} ${u.phone}`.includes(query)).map((u) => <option key={u.id} value={u.id}>{u.fullName} · {u.phone}</option>)}</select></label>
        <label className="form-field"><span>الباقة</span><select required value={planId} onChange={(e) => setPlanId(e.target.value)}><option value="">اختر الباقة</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="form-field"><span>سبب المنح الإداري</span><input required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label><button className="primary-button" disabled={busy}><Check size={17} /> منح الاشتراك</button>
      </form><div className="table-wrap"><table><thead><tr><th>المستخدم</th><th>الباقة</th><th>الحالة</th><th>حصة المزادات</th><th>الانتهاء</th><th>الإجراءات</th></tr></thead><tbody>{subscriptions.map((s) => <tr key={s.id}><td><a href={`/users/${s.userId}`}>{s.user.fullName}</a><small>{s.user.phone}</small></td><td>{s.plan.name}</td><td>{status[s.status] ?? s.status}</td><td>{s.usedAuctions}/{s.plan.auctionLimit ?? 'غير محدود'}</td><td>{s.endsAt ? new Date(s.endsAt).toLocaleString('ar-LY') : '-'}</td><td><div className="row-actions">{[['extend', 'تمديد'], ['set_usage', 'تعديل الاستخدام'], [s.status === 'Suspended' ? 'resume' : 'suspend', s.status === 'Suspended' ? 'استئناف' : 'إيقاف'], ['cancel', 'إلغاء']].map(([action, label]) => <button disabled={busy} key={action} onClick={() => void manage(s, action)}>{label}</button>)}</div></td></tr>)}</tbody></table></div></>}
    {tab === 'content' && <div className="operations-editor"><section><h2>الصفحات</h2>{contents.map((c) => <button key={c.slug} className="content-row" onClick={() => setContent({ slug: c.slug.split(':')[0], locale: c.locale, title: c.title, body: c.body, published: c.status === 'Published' })}><FileText size={18} /><span>{c.title} · {c.locale} · {c.status === 'Published' ? 'منشور' : 'مسودة'}</span></button>)}</section>
      <form className="operations-form" onSubmit={(e) => { e.preventDefault(); void mutate('content', content); }}><h2>تحرير الصفحة</h2><label className="form-field"><span>نوع الصفحة</span><select value={content.slug} onChange={(e) => setContent({ ...content, slug: e.target.value })}>{[['terms', 'الشروط والأحكام'], ['privacy', 'الخصوصية'], ['auction-rules', 'قواعد المزاد'], ['consumer-protection', 'حماية المستهلك']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label><label className="form-field"><span>اللغة</span><select value={content.locale} onChange={(e) => setContent({ ...content, locale: e.target.value })}><option value="ar">العربية</option><option value="en">English</option></select></label><label className="form-field"><span>العنوان</span><input required minLength={2} maxLength={150} value={content.title} onChange={(e) => setContent({ ...content, title: e.target.value })} /></label><label className="form-field"><span>المحتوى</span><textarea required minLength={10} maxLength={50000} rows={16} value={content.body} onChange={(e) => setContent({ ...content, body: e.target.value })} /></label><label><input type="checkbox" checked={content.published} onChange={(e) => setContent({ ...content, published: e.target.checked })} /> نشر الصفحة</label><button disabled={busy} className="primary-button"><Save size={17} /> حفظ نسخة جديدة</button></form></div>}
    {tab === 'withdrawals' && <div className="table-wrap"><table><thead><tr><th>المستخدم</th><th>المبلغ</th><th>الحالة</th><th>السبب</th><th>مرجع التحويل</th><th>القرار</th></tr></thead><tbody>{withdrawals.map((w) => <tr key={w.id}><td><a href={`/users/${w.userId}`}>{w.userId}</a></td><td>{w.amountLyd.toLocaleString('ar-LY')} د.ل</td><td>{status[w.status]}</td><td>{w.reason}</td><td>{w.transferReference ?? '-'}</td><td>{w.status === 'Pending' && <div className="row-actions"><button disabled={busy} title="تسجيل تحويل فعلي" onClick={() => void resolve(w, 'paid')}><Check size={17} /></button><button disabled={busy} title="رفض وإعادة الرصيد" onClick={() => void resolve(w, 'reject')}><X size={17} /></button></div>}</td></tr>)}</tbody></table></div>}
    {tab === 'requests' && <>{(['sales', 'inspections'] as const).map((kind) => <section key={kind}><h2>{kind === 'sales' ? 'طلبات الشراء' : 'طلبات الفحص'}</h2><div className="table-wrap"><table><thead><tr><th>الطلب</th><th>المركبة</th><th>صاحب الطلب</th><th>المستقبل</th><th>الحالة</th><th>التاريخ</th></tr></thead><tbody>{requests[kind].map((r) => <tr key={r.id}><td>{r.id}</td><td>{r.vehicle?.make} {r.vehicle?.model}</td><td><a href={`/users/${r.requesterId}`}>تفاصيل المستخدم</a></td><td>{r.technician?.name ?? r.sellerId}</td><td>{status[r.status] ?? r.status}</td><td>{new Date(r.createdAt).toLocaleString('ar-LY')}</td></tr>)}</tbody></table></div></section>)}</>}
    {tab === 'reviews' && <div className="table-wrap"><table><thead><tr><th>الجهة</th><th>المستخدم</th><th>التقييم</th><th>التعليق</th><th>الحالة</th><th>تعديل</th></tr></thead><tbody>{reviews.map((r) => <tr key={r.id}><td>{r.dealer?.name ?? r.technician?.name}</td><td>{r.reviewer.fullName}</td><td>{r.rating}/5</td><td>{r.comment}</td><td>{r.isHidden ? 'مخفي' : 'ظاهر'}</td><td><button title="تعديل التقييم" className="icon-button" onClick={() => { setEdit({ ...r }); setReviewReason(''); }}><Pencil size={17} /></button></td></tr>)}</tbody></table></div>}
    {edit && <div className="modal-backdrop"><form className="vehicle-form" onSubmit={async (e) => { e.preventDefault(); if (await mutate(`reviews/${edit.id}`, { rating: edit.rating, comment: edit.comment ?? '', hidden: edit.isHidden, reason: reviewReason }, 'PATCH')) setEdit(null); }}><header className="form-header"><h2>تعديل التقييم</h2><button type="button" className="icon-button" title="إغلاق" onClick={() => setEdit(null)}><X /></button></header><div className="form-grid"><label className="form-field"><span>التقييم</span><select value={edit.rating} onChange={(e) => setEdit({ ...edit, rating: Number(e.target.value) })}>{[1,2,3,4,5].map((n) => <option key={n}>{n}</option>)}</select></label><label className="form-field full-field"><span>التعليق</span><textarea maxLength={1000} rows={4} value={edit.comment ?? ''} onChange={(e) => setEdit({ ...edit, comment: e.target.value })} /></label><label><input type="checkbox" checked={edit.isHidden} onChange={(e) => setEdit({ ...edit, isHidden: e.target.checked })} /> إخفاء التقييم</label><label className="form-field full-field"><span>سبب التعديل</span><input required minLength={3} maxLength={500} value={reviewReason} onChange={(e) => setReviewReason(e.target.value)} /></label></div><button className="primary-button" disabled={busy}><Save size={17} /> حفظ مع السجل</button></form></div>}
  </main>;
}
