'use client';

import { LoaderCircle, Save, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

type Override = {
  code: string;
  name: string;
  label: string;
  isActive: boolean;
  planEnabled: boolean;
  effect: 'Allow' | 'Deny' | 'Inherit';
  reason: string | null;
  effective: boolean;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const body = await response.json() as T & { message?: string | string[] };
  if (!response.ok) {
    throw new Error(Array.isArray(body.message) ? body.message.join('، ') : body.message || 'تعذر تنفيذ العملية');
  }
  return body;
}

export function CapabilityOverrides({ subjectType, subjectId }: { subjectType: 'User' | 'Dealer'; subjectId: string }) {
  const [items, setItems] = useState<Override[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { effect: Override['effect']; reason: string }>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await api<Override[]>(`/api/admin/dealers/capability-overrides/${subjectType}/${encodeURIComponent(subjectId)}`);
      setItems(result);
      setDrafts(Object.fromEntries(result.map((item) => [item.code, { effect: item.effect, reason: item.reason ?? '' }])));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر تحميل الصلاحيات'); }
    finally { setLoading(false); }
  }, [subjectId, subjectType]);

  useEffect(() => { void load(); }, [load]);

  async function save(item: Override) {
    const draft = drafts[item.code];
    if (!draft) return;
    setBusy(item.code); setError('');
    try {
      await api(`/api/admin/dealers/capability-overrides/${subjectType}/${encodeURIComponent(subjectId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ capability: item.code, effect: draft.effect, reason: draft.reason || undefined }),
      });
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر حفظ الاستثناء'); }
    finally { setBusy(''); }
  }

  return <section className="panel capability-overrides">
    <div className="panel-header"><div><p className="eyebrow">تُطبق بعد صلاحيات الباقة وتُسجل في Audit Log</p><h2>الصلاحيات الفردية</h2></div><ShieldCheck size={20} /></div>
    {error && <p className="notice error">{error}</p>}
    {loading ? <div className="loading-state"><LoaderCircle className="spin" size={18} /> جاري تحميل الصلاحيات</div> : <div className="override-list">
      {items.map((item) => { const draft = drafts[item.code] ?? { effect: item.effect, reason: item.reason ?? '' }; return <div key={item.code}>
        <div className="override-name"><span className={item.effective ? 'capability-dot active' : 'capability-dot'} /><div><strong>{item.name || item.label}</strong><small dir="ltr">{item.code}</small></div></div>
        <span className={item.planEnabled ? 'override-plan enabled' : 'override-plan'}>{item.planEnabled ? 'مسموحة بالباقة' : 'غير مشمولة'}</span>
        <select aria-label={`حكم ${item.name}`} value={draft.effect} onChange={(event) => setDrafts({ ...drafts, [item.code]: { ...draft, effect: event.target.value as Override['effect'] } })}><option value="Inherit">حسب الباقة</option><option value="Allow">سماح خاص</option><option value="Deny">منع خاص</option></select>
        <input aria-label={`سبب تعديل ${item.name}`} placeholder="سبب التعديل" value={draft.reason} onChange={(event) => setDrafts({ ...drafts, [item.code]: { ...draft, reason: event.target.value } })} />
        <button className="icon-button" title="حفظ الصلاحية" disabled={busy === item.code || !item.isActive} onClick={() => void save(item)}>{busy === item.code ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}</button>
      </div>; })}
    </div>}
  </section>;
}
