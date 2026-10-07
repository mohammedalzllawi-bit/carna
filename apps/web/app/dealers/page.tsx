'use client';

import { ArrowRight, BadgeCheck, Building2, CarFront, LoaderCircle, MapPin, Star } from 'lucide-react';
import { useEffect, useState } from 'react';

type Dealer = { id: string; name: string; logoUrl: string | null; city: string | null; ratingAverage: number; ratingCount: number; vehicleCount: number; verified: boolean };

export default function DealersPage() {
  const [items, setItems] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { fetch('/api/platform/dealers', { cache: 'no-store' }).then(async (response) => { if (!response.ok) throw new Error(); return response.json(); }).then(setItems).catch(() => setError('تعذر تحميل المعارض حالياً.')).finally(() => setLoading(false)); }, []);
  return <main className="market-page"><header className="market-heading"><a href="/"><ArrowRight size={17} /> الرئيسية</a><h1>المعارض الموثقة</h1><span>{items.length} معرض</span></header>{loading && <div className="public-list-state"><LoaderCircle className="spin" size={28} /> جارٍ التحميل...</div>}{error && <div className="public-list-state error">{error}</div>}<section className="public-dealer-grid">{items.map((dealer) => <a href={`/dealers/${dealer.id}`} key={dealer.id}><div className="public-dealer-logo">{dealer.logoUrl ? <img src={dealer.logoUrl} alt="" /> : <Building2 size={31} />}</div><div><p>{dealer.verified && <BadgeCheck size={15} />} معرض موثّق</p><h2>{dealer.name}</h2><span><MapPin size={14} />{dealer.city ?? 'ليبيا'}</span></div><dl><div><dt><Star size={14} /> التقييم</dt><dd>{dealer.ratingAverage.toFixed(1)} ({dealer.ratingCount})</dd></div><div><dt><CarFront size={14} /> السيارات</dt><dd>{dealer.vehicleCount}</dd></div></dl></a>)}</section>{!loading && !items.length && <div className="public-list-state"><Building2 size={38} /><h2>لا توجد معارض منشورة بعد</h2></div>}</main>;
}
