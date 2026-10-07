'use client';
import { ArrowRight, CarFront, Gavel, MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { mediaUrl } from '../../lib/media';
import SaveControls from '../components/save-controls';

type Auction = { id: string; status: string; currentBidLyd: number; bidCount: number; startsAt: string; endsAt: string; vehicle: { id: string; make: string; model: string; year: number; city: string | null; imageUrl: string | null; lotNumber: string } };
export default function AuctionsPage() {
  const [items, setItems] = useState<Auction[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch('/api/platform/auctions').then(async (r) => { if (!r.ok) throw new Error('تعذر تحميل المزادات'); return r.json(); }).then(setItems).catch((e: Error) => setError(e.message)).finally(() => setLoading(false)); }, []);
  return <main className="market-page"><header className="market-heading"><a href="/"><ArrowRight size={18} /> السوق</a><h1>المزادات</h1><a href="/account">حسابي</a></header>{loading ? <p>جارٍ تحميل المزادات...</p> : error ? <p role="alert">{error}</p> : !items.length ? <div className="public-empty"><Gavel size={42} /><h2>لا توجد مزادات متاحة حالياً</h2></div> : <section className="auction-list">{items.map((item) => <article className="auction-list-item" key={item.id}><a href={`/auctions/${item.id}`} className="auction-list-image">{item.vehicle.imageUrl ? <img src={mediaUrl(item.vehicle.imageUrl)} alt={`${item.vehicle.make} ${item.vehicle.model}`} /> : <CarFront size={44} />}</a><div><span className={`auction-status ${item.status}`}>{item.status === 'Live' ? 'مباشر' : item.status === 'Paused' ? 'متوقف مؤقتاً' : 'قادم'}</span><a href={`/auctions/${item.id}`}><h2>{item.vehicle.make} {item.vehicle.model} {item.vehicle.year}</h2></a><p><MapPin size={14} /> {item.vehicle.city} <span dir="ltr">{item.vehicle.lotNumber}</span></p><small>البداية: {new Date(item.startsAt).toLocaleString('ar-LY')}</small><SaveControls vehicleId={item.vehicle.id} auctionId={item.id} /></div><div><strong>{item.currentBidLyd.toLocaleString('ar-LY')} د.ل</strong><p>{item.bidCount} مزايدة</p><small>النهاية: {new Date(item.endsAt).toLocaleString('ar-LY')}</small></div></article>)}</section>}</main>;
}
