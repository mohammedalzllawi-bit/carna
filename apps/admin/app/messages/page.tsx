'use client';

import { ArrowRight, MessageSquare, RefreshCw, Search, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

type ConversationRow = { id: string; vehicle: { id: string; make: string; model: string; year: number; lotNumber: string };
  buyer: { id: string; fullName: string | null }; seller: { id: string; fullName: string | null };
  lastMessage: string | null; updatedAt: string };
type Message = { id: string; senderId: string; body: string; audioUrl: string | null; audioDurationSeconds: number | null; createdAt: string };
type Detail = { id: string; vehicle: ConversationRow['vehicle']; buyer: ConversationRow['buyer']; seller: ConversationRow['seller']; messages: Message[] };

export default function AdminMessagesPage() {
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (number: number) => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/admin/messages?page=${number}`, { cache: 'no-store' });
      if (response.status === 401) { location.href = '/login'; return; }
      if (!response.ok) throw new Error('لا تملك صلاحية مراجعة المحادثات أو تعذر تحميلها.');
      const data = await response.json() as { items: ConversationRow[]; total: number };
      setRows(data.items); setTotal(data.total);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر التحميل'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(page); }, [load, page]);

  async function open(id: string) {
    setError('');
    const response = await fetch(`/api/admin/messages/${id}`, { cache: 'no-store' });
    if (!response.ok) { setError('تعذر فتح المحادثة أو لا تملك صلاحيتها.'); return; }
    setDetail(await response.json() as Detail);
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return !term ? rows : rows.filter((item) => [item.vehicle.make, item.vehicle.model, item.vehicle.lotNumber,
      item.buyer.fullName, item.seller.fullName].some((value) => value?.toLowerCase().includes(term)));
  }, [rows, search]);

  return <main className="management-page admin-messages-page" dir="rtl">
    <header className="management-header"><div><a href="/"><ArrowRight size={17} /> لوحة الإدارة</a><h1>مراجعة الرسائل</h1><p>الوصول مقيد لفريق الدعم، وفتح المحادثة يُسجل في سجل التدقيق.</p></div><button className="icon-button" type="button" title="تحديث" onClick={() => void load(page)}><RefreshCw size={18} /></button></header>
    {error && <p className="notice error" role="alert">{error}</p>}
    <div className="admin-chat-layout">
      <section className="admin-chat-list"><div className="admin-chat-list-toolbar"><label><Search size={17} /><input aria-label="بحث في الصفحة" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="المركبة أو اسم الطرف" /></label><span>{total} محادثة</span></div>
        {loading && <p>جارٍ تحميل المحادثات...</p>}
        {!loading && !filtered.length && <p className="detail-empty">لا توجد محادثات في هذه الصفحة.</p>}
        {filtered.map((item) => <button className={detail?.id === item.id ? 'admin-chat-row active' : 'admin-chat-row'} key={item.id} onClick={() => void open(item.id)}>
          <MessageSquare size={18} /><span><strong>{item.vehicle.make} {item.vehicle.model} · {item.vehicle.year}</strong><small>{item.buyer.fullName || 'مشتري'} ↔ {item.seller.fullName || 'بائع'}</small><em>{item.lastMessage || 'محادثة جديدة'}</em></span><time>{new Date(item.updatedAt).toLocaleDateString('ar-LY')}</time>
        </button>)}
        <div className="admin-chat-pagination"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button><span>{page} / {Math.max(1, Math.ceil(total / 50))}</span><button disabled={page * 50 >= total} onClick={() => setPage(page + 1)}>التالي</button></div>
      </section>
      <section className="admin-chat-detail" aria-label="المحادثة المحددة">
        {!detail && <div className="detail-empty"><MessageSquare size={27} /><p>اختر محادثة لعرضها.</p></div>}
        {detail && <><header><strong>{detail.vehicle.make} {detail.vehicle.model}</strong><small>{detail.vehicle.lotNumber} · {detail.buyer.fullName || 'مشتري'} / {detail.seller.fullName || 'بائع'}</small></header>
          <div className="admin-chat-messages">{detail.messages.map((item) => <article key={item.id}>
            <small>{item.senderId === detail.buyer.id ? detail.buyer.fullName || 'المشتري' : detail.seller.fullName || 'البائع'} · {new Date(item.createdAt).toLocaleString('ar-LY')}</small>
            {item.audioUrl ? <div className="voice-message"><Volume2 size={18} /><audio controls preload="none" src={item.audioUrl} /> <span>{item.audioDurationSeconds} ث</span></div> : <p>{item.body}</p>}
          </article>)}</div></>}
      </section>
    </div>
  </main>;
}
