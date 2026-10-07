'use client';

import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, CalendarDays, Clock3, MapPin, MessageCircle, Phone, Tag, Gauge } from 'lucide-react';
import { useEffect, useState } from 'react';
import { mediaUrl } from '../../../lib/media';
import { publishedDateDetailed } from '../../../lib/published_at';
import SaveControls from '../../components/save-controls';

type Vehicle = {
  id: string; make: string; model: string; trim?: string | null; category: string;
  year: number; mileageKm?: number | null; city?: { nameAr: string } | null;
  priceLyd?: number | null; lotNumber: string; saleType: string;
  images: { url: string }[]; imageUrl?: string | null; contactPhone?: string | null;
  publishedAt?: string | null;
};
const categories: Record<string, string> = { Car: 'سيارة', Truck: 'شاحنة', Motorcycle: 'دراجة نارية', Bicycle: 'دراجة هوائية', Other: 'أخرى' };
const sales: Record<string, string> = { QuickSale: 'بيع سريع', FixedPrice: 'سعر ثابت', Negotiable: 'قابل للتفاوض', Auction: 'مزاد' };

export default function VehicleDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [image, setImage] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/platform/catalog/vehicles/${id}`).then(async (response) => {
      if (!response.ok) throw new Error('لم يعد هذا العرض متاحاً');
      return response.json() as Promise<Vehicle>;
    }).then(setVehicle).catch((caught) => setError(caught.message));
  }, [id]);

  async function messageSeller() {
    if (!vehicle) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/platform/listing-chats', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ vehicleId: vehicle.id }) });
      if (response.status === 401) { router.push(`/auth?next=${encodeURIComponent(`/vehicles/${vehicle.id}`)}`); return; }
      if (!response.ok) throw new Error('المحادثة غير متاحة لهذا العرض');
      const chat = await response.json() as { id: string };
      router.push(`/messages/${chat.id}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر فتح المحادثة'); }
    finally { setBusy(false); }
  }

  if (!vehicle) return <main className="detail-page"><a href="/" className="detail-back"><ArrowRight size={17} /> الرئيسية</a><p>{error || 'جارٍ تحميل العرض...'}</p></main>;
  const photos = vehicle.images.length ? vehicle.images.map((item) => item.url) : vehicle.imageUrl ? [vehicle.imageUrl] : [];
  const published = publishedDateDetailed(vehicle.publishedAt);
  return <main className="detail-page" dir="rtl">
    <a href="/#vehicles" className="detail-back"><ArrowRight size={17} /> جميع المركبات</a>
    <div className="detail-layout">
      <div>
        <div className="detail-photo">{photos.length ? <Image src={mediaUrl(photos[Math.min(image, photos.length - 1)])} alt={`${vehicle.make} ${vehicle.model}`} fill unoptimized sizes="(max-width: 760px) 100vw, 65vw" /> : <span>لا توجد صورة</span>}</div>
        {photos.length > 1 && <div className="detail-thumbs">{photos.map((photo, index) => <button key={`${photo}-${index}`} type="button" className={image === index ? 'active' : ''} onClick={() => setImage(index)} aria-label={`صورة ${index + 1}`}><Image src={mediaUrl(photo)} alt="" fill unoptimized sizes="80px" /></button>)}</div>}
      </div>
      <div className="detail-info">
        <span className="detail-category">{categories[vehicle.category] ?? 'مركبة'} · {sales[vehicle.saleType] ?? vehicle.saleType}</span>
        <h1>{vehicle.make} {vehicle.model}{vehicle.trim ? ` ${vehicle.trim}` : ''}</h1>
        <SaveControls vehicleId={vehicle.id} />
        <strong className="detail-price">{vehicle.priceLyd == null ? 'السعر عند التواصل' : `${vehicle.priceLyd.toLocaleString('ar-LY')} د.ل`}</strong>
        <div className="detail-facts">
          <span><CalendarDays size={18} /> {vehicle.year}</span>
          <span><MapPin size={18} /> {vehicle.city?.nameAr ?? 'غير محددة'}</span>
          <span><Gauge size={18} /> {vehicle.mileageKm == null ? 'العداد غير محدد' : `${vehicle.mileageKm.toLocaleString('ar-LY')} كم`}</span>
          <span><Tag size={18} /> رقم {vehicle.lotNumber}</span>
          {published && <div className="detail-published"><Clock3 size={18} /> تاريخ النشر: <time dateTime={vehicle.publishedAt!}>{published}</time></div>}
        </div>
        {vehicle.saleType !== 'Auction' && <div className="detail-actions">
          {vehicle.contactPhone ? <a href={`tel:${vehicle.contactPhone}`}><Phone size={18} /> اتصال</a> : <span>الاتصال الهاتفي غير متاح</span>}
          <button type="button" onClick={() => void messageSeller()} disabled={busy}><MessageCircle size={18} /> مراسلة داخل المنصة</button>
        </div>}
        {error && <p role="alert" className="detail-error">{error}</p>}
        <div className="workspace-actions">{vehicle.saleType !== 'Auction' && <a href={`/workspace?tab=requests&action=sale&vehicleId=${vehicle.id}`}>طلب شراء</a>}<a href={`/workspace?tab=requests&action=inspection&vehicleId=${vehicle.id}`}>طلب فحص</a></div>
      </div>
    </div>
  </main>;
}
