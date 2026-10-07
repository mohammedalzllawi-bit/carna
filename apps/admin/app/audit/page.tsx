'use client';
import { ArrowRight, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
type Log = { id: string; action: string; entityType: string; entityId: string; createdAt: string; actor: { fullName: string } | null; before: unknown; after: unknown };
export default function AuditPage() {
  const [items, setItems] = useState<Log[]>([]); const [error, setError] = useState(''); const [query, setQuery] = useState('');
  useEffect(() => { fetch('/api/admin/audit').then(async (r) => { if (!r.ok) throw new Error('تعذر تحميل سجل التدقيق'); return r.json(); }).then(setItems).catch((e: Error) => setError(e.message)); }, []);
  return <main className="management-page"><header className="management-header"><div><a href="/"><ArrowRight size={17} /> لوحة الإدارة</a><h1>سجل التدقيق</h1></div><label className="admin-search"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="العملية أو الكيان" /></label></header>{error && <p className="notice error">{error}</p>}<div className="table-wrap"><table><thead><tr><th>الوقت</th><th>المنفذ</th><th>العملية</th><th>الكيان</th><th>التفاصيل</th></tr></thead><tbody>{items.filter((x) => (x.action + x.entityType).toLowerCase().includes(query.toLowerCase())).map((x) => <tr key={x.id}><td>{new Date(x.createdAt).toLocaleString('ar-LY')}</td><td>{x.actor?.fullName ?? 'النظام'}</td><td dir="ltr">{x.action}</td><td>{x.entityType}<small>{x.entityId}</small></td><td><details><summary>عرض</summary><pre dir="ltr" style={{ maxWidth: 420, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify({ before: x.before, after: x.after }, null, 2)}</pre></details></td></tr>)}</tbody></table></div></main>;
}
