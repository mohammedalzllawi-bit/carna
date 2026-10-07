'use client';

import { ArrowRight, BadgeCheck, Clock3, MapPin, Search, Star, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const apiUrl = '/api/platform';
type Technician = {
  id: string; name: string; specialty: string; yearsExperience?: number | null;
  city?: { id: string; nameAr: string } | null; basePriceLyd: number; availabilityStatus: string;
  ratingAverage: number; ratingCount: number; completedInspections: number;
  services: { id: string; name: string; priceLyd: number; durationMinutes?: number | null }[];
};

export default function TechniciansPage() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${apiUrl}/technicians`)
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<Technician[]>; })
      .then(setTechnicians)
      .catch(() => setError('تعذر تحميل قائمة الفنيين.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value ? technicians.filter((item) => `${item.name} ${item.specialty} ${item.city?.nameAr ?? ''}`.toLowerCase().includes(value)) : technicians;
  }, [query, technicians]);

  return (
    <main className="technicians-public">
      <header className="technicians-public-header"><div><a href="/"><ArrowRight size={17} /> العودة للسوق</a><span>خدمة فحص السيارة</span><h1>الفنيون المعتمدون</h1></div><label><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم أو التخصص أو المدينة" /></label></header>
      {loading ? <div className="public-list-state">جارٍ تحميل الفنيين...</div> : null}
      {error ? <div className="public-list-state error">{error}</div> : null}
      {!loading && !error && filtered.length === 0 ? <div className="public-list-state"><Wrench size={38} /><h2>لا يوجد فنيون منشورون حالياً</h2><p>تظهر الملفات هنا بعد اعتمادها من إدارة المنصة.</p></div> : null}
      <section className="technician-public-grid">{filtered.map((technician) => <article className="technician-public-card" key={technician.id}><div className="technician-card-head"><span className="technician-avatar"><Wrench size={25} /></span><div><div className="verified-row"><BadgeCheck size={15} /> فني معتمد</div><h2><a href={`/technicians/${technician.id}`}>{technician.name}</a></h2><p>{technician.specialty}</p></div><span className={technician.availabilityStatus === 'available' ? 'availability available' : 'availability'}>{technician.availabilityStatus === 'available' ? 'متاح' : 'غير متاح'}</span></div><div className="technician-meta"><span><MapPin size={15} />{technician.city?.nameAr ?? 'غير محددة'}</span><span><Star size={15} />{technician.ratingAverage.toFixed(1)} ({technician.ratingCount})</span><span><Clock3 size={15} />{technician.yearsExperience ?? 0} سنوات خبرة</span></div><div className="technician-services">{technician.services.slice(0, 3).map((service) => <div key={service.id}><span>{service.name}</span><strong>{service.priceLyd.toLocaleString('ar-LY')} د.ل</strong></div>)}</div><div className="technician-card-bottom"><div><small>يبدأ من</small><strong>{technician.basePriceLyd.toLocaleString('ar-LY')} د.ل</strong></div><a href={`/technicians/${technician.id}`}>التفاصيل والتقييمات</a></div></article>)}</section>
    </main>
  );
}
