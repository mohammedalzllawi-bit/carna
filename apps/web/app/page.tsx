'use client';

import Image from 'next/image';
import {
  ArrowLeft,
  BadgeCheck,
  Bell,
  CalendarDays,
  CarFront,
  ChevronDown,
  Clock3,
  Gauge,
  Gavel,
  Heart,
  MapPin,
  Menu,
  Search,
  ShieldCheck,
  UserRound,
  Wrench,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { mediaUrl } from '../lib/media';
import { publishedDateRelative } from '../lib/published_at';

const apiUrl = '/api/platform';

type City = { id: string; nameAr: string };
type Vehicle = {
  id: string;
  category?: 'Car' | 'Truck' | 'Motorcycle' | 'Bicycle' | 'Other';
  lotNumber: string;
  make: string;
  model: string;
  trim?: string | null;
  year: number;
  mileageKm?: number | null;
  saleType: 'Auction' | 'QuickSale' | 'FixedPrice' | 'Negotiable';
  priceLyd?: number | null;
  city?: City | null;
  imageUrl?: string | null;
  publishedAt?: string | null;
  auction?: { currentBidLyd: number; bidCount: number; endsAt: string } | null;
};
type LiveAuction = {
  id: string;
  vehicle: string;
  lotNumber: string;
  city?: string | null;
  currentBidLyd: number;
  bidCount: number;
  endsAt: string;
};
type HomeData = { cities: City[]; vehicles: Vehicle[]; liveAuction: LiveAuction | null };

const saleTypeLabels: Record<Vehicle['saleType'], string> = {
  Auction: 'مزاد',
  QuickSale: 'بيع سريع',
  FixedPrice: 'سعر ثابت',
  Negotiable: 'قابل للتفاوض',
};
const categoryLabels = { Car: 'سيارات', Truck: 'شاحنات', Motorcycle: 'دراجات نارية', Bicycle: 'دراجات هوائية', Other: 'أخرى' };

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [searchStatus, setSearchStatus] = useState('جارٍ تحميل السيارات...');
  const [home, setHome] = useState<HomeData>({ cities: [], vehicles: [], liveAuction: null });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    fetch('/api/platform/account/favorites').then(async (response) => response.ok ? response.json() : []).then((items: { vehicleId: string }[]) => setFavorites(items.map((item) => item.vehicleId))).catch(() => {});
    Promise.all([
      fetch(`${apiUrl}/catalog/home`).then(async (response) => { if (!response.ok) throw new Error('تعذر تحميل البيانات'); return response.json() as Promise<HomeData>; }),
      fetch(`${apiUrl}/catalog/vehicles?sort=newest`).then(async (response) => { if (!response.ok) throw new Error('تعذر تحميل المركبات'); return response.json() as Promise<Vehicle[]>; }),
    ])
      .then(([data, vehicles]) => {
        setHome({ ...data, vehicles });
        setSearchStatus(vehicles.length ? `${vehicles.length} مركبة منشورة` : 'لا توجد مركبات منشورة حالياً');
      })
      .catch(() => setSearchStatus('تعذر الاتصال بالخادم. تأكد من تشغيل API.'));
  }, []);

  const [sort, setSort] = useState('newest');
  const [period, setPeriod] = useState('all');

  async function toggleFavorite(id: string) {
    const response = await fetch(`/api/platform/account/favorites/${id}`, { method: favorites.includes(id) ? 'DELETE' : 'POST' });
    if (response.status === 401) { location.href = '/auth'; return; }
    if (!response.ok) { setSearchStatus('تعذر تحديث المفضلة. حاول مجدداً.'); return; }
    setFavorites((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchStatus('جارٍ البحث في قاعدة البيانات...');
    const form = new FormData(event.currentTarget);
    const query = new URLSearchParams();
    for (const key of ['q', 'model', 'category', 'cityId', 'sort', 'period']) {
      const value = form.get(key)?.toString().trim();
      if (value) query.set(key, value);
    }
    const range = query.get('period');
    query.delete('period');
    if (range && range !== 'all') {
      const now = new Date();
      const date = range === 'today' ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : new Date(now.getTime() - (range === 'week' ? 7 : 30) * 86400000);
      query.set('dateFrom', date.toISOString());
    }
    try {
      const response = await fetch(`${apiUrl}/catalog/vehicles?${query.toString()}`);
      if (!response.ok) throw new Error();
      const vehicles = (await response.json()) as Vehicle[];
      setHome((current) => ({ ...current, vehicles }));
      setSearchStatus(vehicles.length ? `تم العثور على ${vehicles.length} مركبة` : 'لا توجد نتائج مطابقة');
    } catch {
      setSearchStatus('تعذر تنفيذ البحث الآن');
    }
  }

  return (
    <div className="site-shell">
      <section className="hero" aria-label="البحث عن السيارات">
        <Image
          src="/images/libya-car-market-hero.png"
          alt="سيارات معروضة في سوق ليبي حديث"
          fill
          priority
          sizes="100vw"
          className="hero-image"
        />
        <div className="hero-shade" />

        <header className="site-header">
          <a className="brand" href="#" aria-label="سوق بنغازي - الرئيسية">
            <span className="brand-mark"><CarFront size={25} /></span>
            <span>سوق <b>بنغازي</b></span>
          </a>

          <nav className={menuOpen ? 'main-nav main-nav-open' : 'main-nav'} aria-label="التنقل الرئيسي">
            <a href="#vehicles">السيارات</a>
            <a href="/auctions">المزادات</a>
            <a href="/sell">بيع مركبة</a>
            <a href="/sell/auction">أضف للمزاد</a>
            <a href="/dealers">المعارض</a>
            <a href="/technicians">الفحص والفنيون</a>
            <a href="#quick-sale">البيع السريع</a>
          </nav>

          <div className="header-actions">
            <a className="icon-button" href="/notifications" aria-label="الإشعارات" title="الإشعارات">
              <Bell size={20} />
              <span className="notification-dot" />
            </a>
            <a className="account-button" href="/account">
              <UserRound size={19} />
              <span>حسابي</span>
            </a>
            <button
              className="menu-button"
              type="button"
              onClick={() => setMenuOpen((current) => !current)}
              aria-label={menuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
            >
              {menuOpen ? <X size={23} /> : <Menu size={23} />}
            </button>
          </div>
        </header>

        <div className="hero-content">
          <div className="live-label"><span /> سوق بنغازي للسيارات</div>
          <h1>سوق بنغازي للسيارات</h1>
          <p>سيارات موثقة، مزادات واضحة، وكل التكلفة أمامك قبل أن تزايد.</p>
          <a className="hero-link" href="#auction">
            ادخل المزاد المباشر <ArrowLeft size={18} />
          </a>
        </div>

        <form className="search-panel" id="vehicle-search-form" onSubmit={submitSearch}>
          <label>
            <span>اسم المركبة</span>
            <span className="select-wrap input-wrap">
              <input name="q" placeholder="ابحث بالاسم أو الشركة" />
            </span>
          </label>
          <label>
            <span>الموديل</span>
            <span className="select-wrap input-wrap">
              <input name="model" placeholder="كل الموديلات" />
            </span>
          </label>
          <label>
            <span>التصنيف</span>
            <span className="select-wrap"><select name="category" defaultValue="">
              <option value="">كل المركبات</option>
              {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select><ChevronDown size={17} /></span>
          </label>
          <label>
            <span>المدينة</span>
            <span className="select-wrap">
              <select name="cityId" defaultValue="">
                <option value="">كل المدن</option>
                {home.cities.map((city) => <option key={city.id} value={city.id}>{city.nameAr}</option>)}
              </select>
              <ChevronDown size={17} />
            </span>
          </label>
          <button className="search-button" type="submit">
            <Search size={20} /> بحث
          </button>
          <p className="search-status" aria-live="polite">{searchStatus}</p>
        </form>
      </section>

      <main>
        <section className="auction-band" id="auction">
          <div className="auction-inner">
            <div className="auction-title">
              <span className="auction-icon"><Gavel size={25} /></span>
              <div>
                <small>{home.liveAuction ? 'المزاد المباشر' : 'مزادات بنغازي'}</small>
                <h2>{home.liveAuction ? `جلسة سيارات ${home.liveAuction.city ?? 'بنغازي'}` : 'لا توجد جلسة مباشرة الآن'}</h2>
              </div>
            </div>
            <div className="auction-metric">
              <span>السيارة الحالية</span>
              <strong>{home.liveAuction?.vehicle ?? 'بانتظار جدولة المزاد القادم'}</strong>
            </div>
            <div className="auction-metric">
              <span>أعلى مزايدة</span>
              <strong className="price">{home.liveAuction ? home.liveAuction.currentBidLyd.toLocaleString('ar-LY') : '—'} <small>{home.liveAuction ? 'د.ل' : ''}</small></strong>
            </div>
            <div className="auction-metric countdown">
              <span>{home.liveAuction ? 'ينتهي في' : 'الحالة'}</span>
              <strong>{home.liveAuction ? new Date(home.liveAuction.endsAt).toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit' }) : 'غير مباشر'}</strong>
            </div>
            <a className="bid-button" href={home.liveAuction ? `/auctions/${home.liveAuction.id}` : '/auctions'}>{home.liveAuction ? 'زايد الآن' : 'تصفح المزادات'} <ArrowLeft size={18} /></a>
          </div>
        </section>

        <section className="vehicles-section" id="vehicles">
          <div className="section-heading">
            <div>
              <span className="section-kicker">مختارة لك</span>
              <h2>مركبات متاحة الآن</h2>
            </div>
            <a href="/sell">اعرض مركبتك <ArrowLeft size={17} /></a>
          </div>
          <div className="vehicle-filters">
            <label>الترتيب <select name="sort" form="vehicle-search-form" value={sort} onChange={(event) => { setSort(event.target.value); event.currentTarget.form?.requestSubmit(); }}>
              <option value="newest">الأحدث</option><option value="oldest">الأقدم</option><option value="price_asc">الأقل سعراً</option><option value="price_desc">الأعلى سعراً</option>
            </select></label>
            <label>تاريخ النشر <select name="period" form="vehicle-search-form" value={period} onChange={(event) => { setPeriod(event.target.value); event.currentTarget.form?.requestSubmit(); }}>
              <option value="all">كل التواريخ</option><option value="today">اليوم</option><option value="week">آخر أسبوع</option><option value="month">آخر شهر</option>
            </select></label>
          </div>

          <div className="vehicle-grid">
            {home.vehicles.length === 0 ? <div className="public-empty"><CarFront size={38} /><h3>لا توجد مركبات مطابقة حالياً</h3><p>جرّب تغيير الفلاتر أو عد لاحقاً.</p></div> : null}
            {home.vehicles.map((vehicle) => {
              const isFavorite = favorites.includes(vehicle.id);
              const published = publishedDateRelative(vehicle.publishedAt, now);
              return (
                <article className="vehicle-card" key={vehicle.id}>
                  <div className="vehicle-media">
                    {vehicle.imageUrl ? <Image
                      src={mediaUrl(vehicle.imageUrl)}
                      alt={`${vehicle.make} ${vehicle.model}`}
                      fill
                      unoptimized
                      sizes="50vw"
                    /> : <div className="vehicle-placeholder"><CarFront size={48} /><span>لا توجد صورة</span></div>}
                    <span className="vehicle-kind">{categoryLabels[vehicle.category ?? 'Car']} · {saleTypeLabels[vehicle.saleType]}</span>
                    <button
                      className={isFavorite ? 'favorite active' : 'favorite'}
                      type="button"
                      onClick={() => void toggleFavorite(vehicle.id)}
                      aria-label={isFavorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
                      title={isFavorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
                    >
                      <Heart size={19} fill={isFavorite ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                  <div className="vehicle-body">
                    <div className="verified-row"><BadgeCheck size={16} /> منشور بعد المراجعة</div>
                    <h3><a href={`/vehicles/${vehicle.id}`}>{vehicle.make} {vehicle.model}{vehicle.trim ? ` ${vehicle.trim}` : ''}</a></h3>
                    {published && <time className="vehicle-published" dateTime={vehicle.publishedAt!}><Clock3 size={14} /><span>{published}</span></time>}
                    <div className="vehicle-facts">
                      <span><CalendarDays size={16} /> {vehicle.year}</span>
                      <span><Gauge size={16} /> {vehicle.mileageKm == null ? 'غير محدد' : `${vehicle.mileageKm.toLocaleString('ar-LY')} كم`}</span>
                      <span><MapPin size={16} /> {vehicle.city?.nameAr ?? 'غير محددة'}</span>
                    </div>
                    <div className="vehicle-bottom">
                      <div>
                        <small>{vehicle.auction ? 'السعر الحالي' : 'السعر المعلن'}</small>
                        <strong>{(vehicle.auction?.currentBidLyd ?? vehicle.priceLyd)?.toLocaleString('ar-LY') ?? 'يحدد لاحقاً'} {vehicle.auction || vehicle.priceLyd != null ? <span>د.ل</span> : null}</strong>
                      </div>
                      <a className="vehicle-time" href={`/vehicles/${vehicle.id}`}><Clock3 size={15} /> التفاصيل <ArrowLeft size={14} /></a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="service-band">
          <div id="inspection" className="service-item">
            <span className="service-icon"><Wrench size={25} /></span>
            <div><h2>افحص السيارة قبل الشراء</h2><p>اختر فنياً معتمداً واستلم تقريراً واضحاً داخل حسابك.</p></div>
            <a className="service-link" href="/technicians">اطلب فحصاً <ArrowLeft size={17} /></a>
          </div>
          <div id="dealers" className="service-item protection">
            <span className="service-icon"><ShieldCheck size={25} /></span>
            <div><h2>شراء بشروط واضحة</h2><p>سجل مزايدات محفوظ، رسوم معلنة، ومركز للشكاوى والنزاعات.</p></div>
            <button type="button">حماية المستهلك <ArrowLeft size={17} /></button>
          </div>
        </section>
      </main>

      <footer>
        <a className="brand footer-brand" href="#"><span className="brand-mark"><CarFront size={22} /></span><span>سوق <b>بنغازي</b></span></a>
        <p>منصة ليبية لبيع وشراء السيارات والمزادات الإلكترونية.</p>
        <span>الأسعار بالدينار الليبي LYD</span>
      </footer>
    </div>
  );
}
