'use client';

import { ArrowRight, Bell, CheckCheck, Cloud, CloudOff, Clock3, RefreshCw, Send, X } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';

type Notice = { id: string; title: string; body: string; createdAt: string; readAt: string | null;
  pushState: string; pushAttempts: number; pushSentAt: string | null; pushError: string | null;
  user: { id: string; fullName: string | null; phone: string | null } };
type Scheduled = { id: string; recipientId: string; title: string; body: string; dueAt: string; status: string };
type Audience = 'individual' | 'dealers' | 'users' | 'technicians' | 'all';
type Campaign = { id: string; audience: Audience; mode: string; title: string; dueAt: string;
  status: string; deliveredCount: number; processedCount: number };
type Setting = { key: string; value: unknown; updatedAt: string | null };
type Overview = { recent: Notice[]; scheduled: Scheduled[]; campaigns: Campaign[];
  audienceCounts: Record<Exclude<Audience, 'individual'>, number>;
  settings: Setting[]; unread: number; total: number;
  devices: number; pushSent: number; pushFailed: number;
  channels: { inApp: string; firebasePush: { configured: boolean; projectId: string | null; reason: string | null } } };

async function readJson<T>(response: Response): Promise<T> {
  if (!response.headers.get('content-type')?.includes('json')) {
    throw new Error(`خادم الإدارة أعاد صفحة بدلاً من بيانات. أعد تحميل الصفحة (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

const labels: Record<string, string> = {
  'notifications.instant_enabled': 'إشعارات فورية',
  'notifications.scheduled_enabled': 'إشعارات مجدولة',
  'notifications.auction_enabled': 'إشعارات المزادات والمتابعة',
  'notifications.messages_enabled': 'إشعارات الرسائل الجديدة',
  'notifications.custom_enabled': 'إشعارات الإدارة المخصصة',
};
const pushLabels: Record<string, string> = { Pending: 'بانتظار الإرسال', Sending: 'جارٍ الإرسال', Sent: 'أُرسل للهاتف',
  Failed: 'فشل الإرسال', NoDevice: 'لا يوجد جهاز مسجل', Skipped: 'معطّل من الإعدادات' };
const audienceLabels: Record<Audience, string> = { individual: 'مستخدم محدد', dealers: 'المعارض',
  users: 'المستخدمون العاديون', technicians: 'الفنيون', all: 'الكل' };
const campaignStatuses: Record<string, string> = { Scheduled: 'بانتظار الإرسال', Processing: 'جارٍ الإرسال',
  Sent: 'اكتمل', Cancelled: 'ملغي' };

export default function AdminNotificationsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [mode, setMode] = useState<'instant' | 'scheduled'>('instant');
  const [audience, setAudience] = useState<Audience>('individual');
  const [recipient, setRecipient] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [reminders, setReminders] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/notifications', { cache: 'no-store' });
    if (response.status === 401) { location.href = '/login'; return; }
    if (!response.headers.get('content-type')?.includes('json')) await readJson<Overview>(response);
    if (!response.ok) throw new Error('تعذر تحميل الإشعارات. تحقق من صلاحية الحساب.');
    const next = await readJson<Overview>(response);
    setData(next);
    setReminders((value) => value || ((next.settings.find((item) => item.key === 'notifications.auction_reminder_minutes')?.value as number[] | undefined) ?? []).join(', '));
  }, []);
  useEffect(() => { void load().catch((e: Error) => setError(e.message)); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => void load().catch((e: Error) => setError(e.message)), 10000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function request(path: string, method: 'POST' | 'PATCH', payload?: unknown) {
    const response = await fetch(`/api/admin/notifications${path}`, { method,
      headers: { 'content-type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload) });
    if (response.status === 401) { location.href = '/login'; throw new Error('انتهت جلسة الإدارة.'); }
    const result = await readJson<{ message?: string | string[] }>(response);
    if (!response.ok) {
      throw new Error(Array.isArray(result.message) ? result.message.join('، ') : result.message || 'تعذر تنفيذ العملية');
    }
    return result;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      if (mode === 'scheduled' && (!dueAt || new Date(dueAt) <= new Date())) throw new Error('اختر موعدًا مستقبليًا للإشعار.');
      if (audience !== 'individual' && !window.confirm(`إرسال الإشعار إلى ${audienceLabels[audience]} (${data?.audienceCounts[audience] ?? 0} حسابًا)؟`)) return;
      await request(mode === 'scheduled' ? '/schedule' : '', 'POST', { audience,
        ...(audience === 'individual' ? { recipient } : {}), title, body,
        ...(mode === 'scheduled' ? { dueAt: new Date(dueAt).toISOString() } : {}) });
      setTitle(''); setBody(''); setDueAt('');
      setMessage(mode === 'scheduled' ? 'حُفظ الإشعار المجدول.' : audience === 'individual'
        ? 'حُفظ الإشعار داخل الحساب؛ راقب حالة إرساله للهاتف في القائمة.' : 'أُضيفت الحملة إلى قائمة الإرسال؛ راقب عدد المستلمين وحالة Push أدناه.');
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر الإرسال'); }
    finally { setBusy(false); }
  }

  async function toggle(key: string, value: boolean) {
    setError('');
    try { await request('/settings', 'PATCH', { key, value: !value }); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر حفظ الإعداد'); }
  }

  async function saveReminders() {
    const values = reminders.split(',').map((part) => Number(part.trim()));
    if (values.some((item) => !Number.isInteger(item) || item < 1) || values.length > 10) {
      setError('أدخل دقائق صحيحة مفصولة بفواصل، بحد أقصى 10 أوقات.'); return;
    }
    try { await request('/settings', 'PATCH', { key: 'notifications.auction_reminder_minutes', value: values });
      setMessage('تم تحديث مواعيد تذكير المزاد.'); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر الحفظ'); }
  }

  async function testNotification() {
    try { await request('/test', 'POST'); setMessage('أُنشئ إشعار اختبار لحساب الإدارة. افحص حالة دفعه أدناه.'); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر الاختبار'); }
  }

  async function cancel(id: string) {
    try { await request(`/schedule/${id}/cancel`, 'PATCH'); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر الإلغاء'); }
  }

  async function cancelCampaign(id: string) {
    try { await request(`/campaign/${id}/cancel`, 'PATCH'); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر الإلغاء'); }
  }

  async function readAll() {
    try { await request('/read-all', 'PATCH'); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر تحديد الإشعارات كمقروءة'); }
  }

  const firebase = data?.channels.firebasePush;
  return <main className="management-page notifications-admin-page" dir="rtl">
    <header className="management-header"><div><a href="/"><ArrowRight size={17} /> لوحة الإدارة</a><h1>الإشعارات</h1><p>الإرسال والجدولة ومراقبة التسليم</p></div><div className="row-actions"><button title="تحديث" onClick={() => void load()}><RefreshCw size={18} /></button><button title="اختبار الإشعارات" onClick={() => void testNotification()}><Bell size={18} /></button></div></header>
    {error && <p className="notice error" role="alert">{error}</p>}{message && <p className="notice success" role="status">{message}</p>}
    <section className="notification-status-grid" aria-label="حالة الإشعارات">
      <div><Bell size={21} /><strong>{data?.total ?? '—'}</strong><span>إشعارات داخل الحساب</span></div>
      <div><CheckCheck size={21} /><strong>{data?.pushSent ?? '—'}</strong><span>إرسال Push ناجح</span></div>
      <div><Cloud size={21} /><strong>{data?.devices ?? '—'}</strong><span>أجهزة مسجلة</span></div>
      <div><CloudOff size={21} /><strong>{data?.pushFailed ?? '—'}</strong><span>فشل إرسال Push</span></div>
    </section>
    <div className={firebase?.configured ? 'firebase-status ready' : 'firebase-status'}>
      {firebase?.configured ? <Cloud size={19} /> : <CloudOff size={19} />}
      <div><strong>Firebase Push: {firebase?.configured ? 'مهيأ في الخادم' : 'ينقص إعداد الخادم'}</strong>
        <span>{firebase?.projectId || 'Project ID غير محدد'} · {firebase?.configured ? 'الإرسال يعتمد على وجود جهاز مسجل وموافقة المستخدم' : firebase?.reason || 'اعتماد Service Account غير متاح'}</span></div>
    </div>
    <section className="notification-settings" aria-label="إعدادات الإشعارات"><h2>قنوات الإشعارات</h2><div>
      {Object.entries(labels).map(([key, label]) => { const enabled = data?.settings.find((setting) => setting.key === key)?.value === true;
        return <label key={key} className="notification-toggle"><span>{label}</span><input type="checkbox" checked={enabled} disabled={!data} onChange={() => void toggle(key, enabled)} /></label>; })}
    </div><div className="notification-reminders"><label>تذكير المزاد قبل (بالدقائق)<input value={reminders} onChange={(event) => setReminders(event.target.value)} placeholder="120, 60" /></label><button className="secondary-button" type="button" onClick={() => void saveReminders()}>حفظ المواعيد</button></div></section>
    <div className="notifications-admin-layout">
      <section className="panel"><div className="panel-header"><h2>إشعار مخصص</h2><Send size={19} /></div>
        <div className="admin-tabs" role="tablist" aria-label="موعد الإرسال"><button className={mode === 'instant' ? 'active' : ''} type="button" onClick={() => setMode('instant')}>الآن</button><button className={mode === 'scheduled' ? 'active' : ''} type="button" onClick={() => setMode('scheduled')}>مجدول</button></div>
        <form className="notification-compose" onSubmit={submit}>
          <label><span>المستلمون</span><select value={audience} onChange={(event) => setAudience(event.target.value as Audience)}>
            {Object.entries(audienceLabels).map(([key, label]) => <option key={key} value={key}>{label}{key !== 'individual' && data ? ` (${data.audienceCounts[key as Exclude<Audience, 'individual'>] ?? 0})` : ''}</option>)}
          </select></label>
          {audience === 'individual' && <label><span>رقم هاتف المستخدم أو معرّفه</span><input required maxLength={80} value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="09xxxxxxxx" /></label>}
          <label><span>العنوان</span><input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label><span>النص</span><textarea required maxLength={1000} rows={5} value={body} onChange={(event) => setBody(event.target.value)} /></label>
          {mode === 'scheduled' && <label><span>موعد الإرسال (توقيت جهازك)</span><input required type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label>}
          <button className="primary-button" disabled={busy || (mode === 'instant' && audience !== 'individual' && !!data && !data.audienceCounts[audience])} type="submit"><Send size={16} />{busy ? 'جارٍ الحفظ...' : mode === 'scheduled' ? 'جدولة' : 'إرسال'}</button>
        </form>
      </section>
      <section className="panel"><div className="panel-header"><h2>آخر الإشعارات</h2><button className="secondary-button" type="button" disabled={!data?.unread} onClick={() => void readAll()}><CheckCheck size={16} /> قراءة إشعاراتي</button></div>
        <div className="admin-notification-list">{data?.recent.map((item) => <article key={item.id}><strong>{item.title}</strong><p>{item.body}</p><small>{item.user.fullName || item.user.phone || item.user.id} · {new Date(item.createdAt).toLocaleString('ar-LY')} · {pushLabels[item.pushState] ?? item.pushState}{item.pushError && ` · ${item.pushError}`}</small></article>)}{data && !data.recent.length && <p>لا توجد إشعارات بعد.</p>}</div>
      </section>
    </div>
    <section className="panel scheduled-list"><div className="panel-header"><h2>الإشعارات المجدولة</h2><Clock3 size={19} /></div>
      {data?.campaigns.map((item) => <div key={item.id}><div><strong>{item.title}</strong>
        <small>{audienceLabels[item.audience] ?? item.audience} · {new Date(item.dueAt).toLocaleString('ar-LY')} · {campaignStatuses[item.status] ?? item.status} · أُرسل إلى {item.deliveredCount}</small>
      </div>{item.status === 'Scheduled' && <button type="button" title="إلغاء الحملة" onClick={() => void cancelCampaign(item.id)}><X size={16} /></button>}</div>)}
      {data?.scheduled.map((item) => <div key={item.id}><div><strong>{item.title}</strong><small>{new Date(item.dueAt).toLocaleString('ar-LY')} · {item.status} · {item.recipientId}</small></div>{item.status === 'Scheduled' && <button type="button" title="إلغاء الإشعار" onClick={() => void cancel(item.id)}><X size={16} /></button>}</div>)}
      {data && !data.scheduled.length && !data.campaigns.length && <p>لا توجد إشعارات مجدولة.</p>}
    </section>
  </main>;
}
