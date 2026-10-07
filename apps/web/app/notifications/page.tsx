'use client';
import { ArrowRight, Bell, CheckCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
type Notice = { id: string; title: string; body: string; createdAt: string; readAt: string | null; data: { route?: string } | null };
export default function NotificationsPage() {
  const [items, setItems] = useState<Notice[]>([]);
  const [error, setError] = useState('');
  async function load() { const r = await fetch('/api/platform/notifications'); if (r.status === 401) { location.href = '/auth?returnTo=/notifications'; return; } if (!r.ok) throw new Error('تعذر تحميل الإشعارات'); setItems(await r.json()); }
  useEffect(() => { void load().catch((e: Error) => setError(e.message)); }, []);
  async function readAll() { const r = await fetch('/api/platform/notifications/read-all', { method: 'PATCH' }); if (r.ok) await load(); }
  return <main className="market-page"><header className="market-heading"><a href="/account"><ArrowRight size={17} /> حسابي</a><h1>الإشعارات</h1><button className="guest-button" onClick={() => void readAll()}><CheckCheck size={17} /> قراءة الكل</button></header>{error && <p role="alert">{error}</p>}{!items.length && !error && <div className="public-empty"><Bell size={35} /><h2>لا توجد إشعارات</h2></div>}<section className="notifications-list">{items.map((item) => <article key={item.id} className={item.readAt ? 'notice-item' : 'notice-item unread'}><Bell size={20} /><div><h2>{item.title}</h2><p>{item.body}</p><time>{new Date(item.createdAt).toLocaleString('ar-LY')}</time>{item.data?.route?.startsWith('/') && !item.data.route.startsWith('//') && <a href={item.data.route}>عرض التفاصيل</a>}</div></article>)}</section></main>;
}
