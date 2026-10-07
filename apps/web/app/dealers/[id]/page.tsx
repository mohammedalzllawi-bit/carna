'use client';

import { ArrowRight, BadgeCheck, Building2, CheckCircle2, LoaderCircle, MapPin, MessageSquareText, Star } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type Dealer = { id: string; name: string; coverUrl: string | null; city: string | null; region: string | null; address: string | null; verified: boolean; ratingAverage: number; ratingCount: number; reviews: { id: string; rating: number; comment: string | null; reviewerName: string; createdAt: string }[] };

export default function DealerDetailPage() {
  const params = useParams<{ id: string }>();
  const [dealer, setDealer] = useState<Dealer | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function load() { setLoading(true); try { const response = await fetch(`/api/platform/dealers/${encodeURIComponent(params.id)}`, { cache: 'no-store' }); if (!response.ok) throw new Error(); setDealer(await response.json()); } catch { setError('تعذر تحميل بيانات المعرض.'); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [params.id]);
  async function review(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); setMessage(''); const values = Object.fromEntries(new FormData(event.currentTarget)); const response = await fetch(`/api/platform/dealers/${encodeURIComponent(params.id)}/reviews`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rating: Number(values.rating), comment: values.comment }) }); const body = await response.json(); if (response.status === 401) { window.location.href = `/auth?returnTo=/dealers/${params.id}`; return; } if (!response.ok) setError(body.message || 'تعذر حفظ التقييم.'); else { setMessage('تم حفظ تقييمك.'); (event.currentTarget as HTMLFormElement).reset(); await load(); } setBusy(false); }
  if (loading) return <main className="account-state"><LoaderCircle className="spin" size={27} /> جارٍ تحميل المعرض...</main>;
  if (!dealer) return <main className="account-state"><Building2 size={37} /><h1>المعرض غير متاح</h1><p>{error}</p></main>;
  return <main className="dealer-public-detail"><header><a href="/dealers"><ArrowRight size={17} /> كل المعارض</a><div className="dealer-public-title"><span><Building2 size={34} /></span><div><p>{dealer.verified && <BadgeCheck size={16} />} معرض موثّق</p><h1>{dealer.name}</h1><small><MapPin size={14} /> {[dealer.city, dealer.region, dealer.address].filter(Boolean).join('، ') || 'ليبيا'}</small></div><strong><Star size={18} /> {dealer.ratingAverage.toFixed(1)} <small>{dealer.ratingCount} تقييم</small></strong></div></header>{message && <div className="form-success"><CheckCircle2 size={17} />{message}</div>}{error && <div className="auth-error">{error}</div>}<div className="dealer-review-layout"><section className="portal-section"><div className="section-title"><div><small>آراء العملاء</small><h2>التقييمات والتعليقات</h2></div><MessageSquareText size={21} /></div>{dealer.reviews.map((item) => <article className="dealer-review" key={item.id}><div><strong>{item.reviewerName}</strong><span>{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</span></div><p>{item.comment || 'تقييم دون تعليق'}</p><time>{new Date(item.createdAt).toLocaleDateString('ar-LY')}</time></article>)}{!dealer.reviews.length && <p className="muted-copy">لا توجد تقييمات بعد.</p>}</section><form className="portal-section" onSubmit={review}><div className="section-title"><div><small>بعد التعامل مع المعرض</small><h2>أضف تقييمك</h2></div><Star size={21} /></div><label><span>التقييم</span><select required name="rating" defaultValue="5"><option value="5">5 - ممتاز</option><option value="4">4 - جيد جداً</option><option value="3">3 - جيد</option><option value="2">2 - ضعيف</option><option value="1">1 - سيئ</option></select></label><label><span>التعليق</span><textarea name="comment" maxLength={1000} rows={6} placeholder="اكتب تجربتك بوضوح" /></label><button className="auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <MessageSquareText size={18} />} حفظ التقييم</button></form></div></main>;
}
