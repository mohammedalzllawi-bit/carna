'use client';

import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  CarFront,
  CheckCircle2,
  CreditCard,
  ImagePlus,
  LoaderCircle,
  LogOut,
  MessageSquareText,
  RefreshCw,
  Save,
  ShieldAlert,
  Star,
  Trash2,
  Users,
} from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { mediaUrl } from '../../lib/media';

type Plan = { id: string; name: string; description: string; audience: 'Dealer' | 'Customer' | 'Both'; priceLyd: number; durationDays: number; vehicleLimit: number | null; auctionLimit: number | null; auctionVehicleLimit: number | null; staffLimit: number | null; permissions: string[]; searchBoostEnabled: boolean; adsIncluded: boolean; billingModel: string };
type Subscription = { id: string; status: string; startsAt: string | null; endsAt: string | null; plan: Plan };
type VehicleImage = { id: string; category: string; url: string; sortOrder: number };
type Vehicle = { id: string; lotNumber: string; make: string; model: string; year: number; saleType: string; approvalStatus: string; priceLyd: number | null; imageUrl?: string | null; images: VehicleImage[]; city: { id: string; nameAr: string } | null; auction: { id: string; status: string; currentBidLyd: number; bidCount: number; endsAt: string } | null };
type DealerDashboard = {
  dealer: { id: string; name: string; status: string; city: { id: string; nameAr: string } | null; address: string | null; licenseNumber: string | null; ratingAverage: number; ratingCount: number; counts: { vehicles: number; staff: number; reviews: number } };
  currentSubscription: Subscription | null;
  upcomingSubscription: Subscription | null;
  plans: Plan[];
  orders: { id: string; status: string; totalLyd: number; currency: string; expiresAt: string | null; createdAt: string }[];
  vehicles: Vehicle[];
  reviews: { id: string; rating: number; comment: string | null; reviewerName: string; createdAt: string }[];
};
type Provider = { code: string; name: string };
type City = { id: string; nameAr: string };

const permissionLabels: Record<string, string> = {
  CAN_CREATE_LISTING: 'إضافة سيارات للبيع',
  CAN_CREATE_AUCTION: 'إنشاء طلبات مزاد',
  CAN_LIVE_AUCTION: 'المزاد المباشر',
  CAN_PARTICIPATE_AUCTIONS: 'المشاركة في المزادات',
  CAN_BUY_CARS: 'شراء السيارات',
  CAN_REQUEST_INSPECTION: 'طلب فحص سيارة',
  CAN_REQUEST_INSPECTION_REPORT: 'تقارير الفحص',
  CAN_RECEIVE_DEPOSIT: 'استلام العربون',
  CAN_USE_WALLET: 'المحفظة',
  CAN_ADD_MULTIPLE_CARS: 'إضافة عدة سيارات',
};

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store', headers: { 'content-type': 'application/json', ...init?.headers } });
  const body = await response.json() as T & { message?: string | string[] };
  if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join('، ') : body.message || 'تعذر تنفيذ العملية');
  return body;
}

function localDate(offsetHours: number) {
  const date = new Date(Date.now() + offsetHours * 3_600_000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function DealerPortalPage() {
  const [data, setData] = useState<DealerDashboard | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [rollingRound, setRollingRound] = useState(true);

  async function load(quiet = false) {
    if (!quiet) { setLoading(true); setError(''); }
    try {
      const [dashboard, paymentProviders, cityData] = await Promise.all([
        json<DealerDashboard>('/api/platform/dealer/me'),
        json<Provider[]>('/api/platform/payments/providers'),
        json<City[]>('/api/platform/catalog/cities'),
      ]);
      setData(dashboard); setProviders(paymentProviders); setCities(cityData);
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : 'تعذر تحميل واجهة المعرض';
      if (text.includes('required') || text.includes('permission')) window.location.href = '/auth?returnTo=/dealer';
      else if (!quiet) setError(text);
    } finally { if (!quiet) setLoading(false); }
  }

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(true), 10000);
    return () => clearInterval(timer);
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy('profile'); setError(''); setMessage('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try { await json('/api/platform/dealer/me', { method: 'PATCH', body: JSON.stringify({ ...values, cityId: values.cityId || undefined }) }); setMessage('تم حفظ إعدادات المعرض.'); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر حفظ الإعدادات'); }
    finally { setBusy(''); }
  }

  async function subscribe(plan: Plan) {
    setBusy(plan.id); setError(''); setMessage('');
    try {
      const result = await json<{ order: { id: string; status: string } }>('/api/platform/dealer/subscriptions', { method: 'POST', body: JSON.stringify({ planId: plan.id }) });
      if (result.order.status === 'Paid') setMessage('تم تفعيل الخطة المجانية مباشرة.');
      else setMessage('تم إنشاء طلب الاشتراك. أكمل الدفع من قسم المدفوعات أدناه.');
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر إنشاء الاشتراك'); }
    finally { setBusy(''); }
  }

  async function createVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy('vehicle'); setError(''); setMessage('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const payload = { ...values, year: Number(values.year), mileageKm: values.mileageKm ? Number(values.mileageKm) : undefined,
      priceLyd: values.priceLyd ? Number(values.priceLyd) : undefined };
    try { await json('/api/platform/dealer/vehicles', { method: 'POST', body: JSON.stringify(payload) }); (event.currentTarget as HTMLFormElement).reset(); setMessage('تمت إضافة السيارة كمسودة داخل المعرض.'); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر إضافة السيارة'); }
    finally { setBusy(''); }
  }

  async function submitVehicle(id: string) {
    setBusy(id); setError(''); setMessage('');
    try { await json(`/api/platform/dealer/vehicles/${id}/submit`, { method: 'POST', body: '{}' }); setMessage('تم إرسال السيارة لمراجعة الإدارة.'); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر إرسال السيارة'); }
    finally { setBusy(''); }
  }

  async function uploadVehicleImages(event: FormEvent<HTMLFormElement>, vehicleId: string) {
    event.preventDefault(); setBusy(`images:${vehicleId}`); setError(''); setMessage('');
    const form = event.currentTarget;
    const input = form.elements.namedItem('images') as HTMLInputElement;
    if (!input.files?.length) { setBusy(''); setError('اختر صورة واحدة على الأقل.'); return; }
    const body = new FormData();
    for (const file of Array.from(input.files)) body.append('images', file);
    body.append('category', 'gallery');
    try {
      const response = await fetch(`/api/platform/dealer/vehicles/${vehicleId}/images`, { method: 'POST', body });
      const result = await response.json() as { message?: string | string[] };
      if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join('، ') : result.message || 'تعذر رفع الصور');
      form.reset(); setMessage('تم رفع صور السيارة بنجاح.'); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر رفع الصور'); }
    finally { setBusy(''); }
  }

  async function deleteVehicleImage(vehicleId: string, imageId: string) {
    setBusy(`image:${imageId}`); setError(''); setMessage('');
    try {
      await json(`/api/platform/dealer/vehicles/${vehicleId}/images/${imageId}`, { method: 'DELETE' });
      setMessage('تم حذف الصورة.'); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر حذف الصورة'); }
    finally { setBusy(''); }
  }

  async function requestAuction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy('auction-request'); setError(''); setMessage('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const vehicleId = String(values.vehicleId);
    const payload = { startsAt: new Date(String(values.startsAt)).toISOString(), rollingRound,
      endsAt: rollingRound ? undefined : new Date(String(values.endsAt)).toISOString(),
      startingPriceLyd: values.startingPriceLyd, bidIncrementLyd: values.bidIncrementLyd || undefined, reservePriceLyd: values.reservePriceLyd || undefined };
    try { await json(`/api/platform/dealer/vehicles/${vehicleId}/auction`, { method: 'POST', body: JSON.stringify(payload) }); setMessage('تم إرسال طلب المزاد ضمن اشتراك المعرض، دون رسوم إضافية.'); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر إرسال طلب المزاد'); }
    finally { setBusy(''); }
  }

  async function pay(orderId: string) {
    const provider = providers[0];
    if (!provider) { setError('لا توجد بوابة دفع إلكترونية مفعلة رسميًا حاليًا.'); return; }
    setBusy(orderId); setError('');
    try {
      const result = await json<{ checkoutUrl?: string }>('/api/platform/payments', { method: 'POST', body: JSON.stringify({ orderId, provider: provider.code, idempotencyKey: crypto.randomUUID() }) });
      if (result.checkoutUrl?.startsWith('https://')) window.location.href = result.checkoutUrl;
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر بدء الدفع'); }
    finally { setBusy(''); }
  }

  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/auth'; }

  if (loading) return <main className="account-state"><LoaderCircle className="spin" size={25} /> جارٍ تحميل واجهة المعرض...</main>;
  if (!data) return <main className="account-state"><ShieldAlert size={38} /><h1>واجهة المعرض غير متاحة</h1><p>{error}</p><a className="auth-submit" href="/auth?returnTo=/dealer">تسجيل الدخول</a></main>;
  const current = data.currentSubscription;
  const activePermissions = new Set(current?.plan.permissions ?? []);
  const canCreateListing = Boolean(current && activePermissions.has('CAN_CREATE_LISTING'));
  const canCreateAuction = Boolean(current && activePermissions.has('CAN_CREATE_AUCTION'));
  const vehicleLimitReached = Boolean(current?.plan.vehicleLimit != null && data.vehicles.length >= current.plan.vehicleLimit);
  const vehicleUsage = current?.plan.vehicleLimit
    ? Math.min(100, Math.round((data.vehicles.length / current.plan.vehicleLimit) * 100))
    : 0;

  return <main className="dealer-portal">
    <header className="account-header"><a href="/"><ArrowRight size={17} /> العودة للسوق</a><div><button title="تحديث" onClick={() => void load()}><RefreshCw size={17} /></button><button onClick={() => void logout()}><LogOut size={17} /> خروج</button></div></header>
    <section className="dealer-portal-head"><div className="dealer-identity"><span><Building2 size={30} /></span><div><small>واجهة إدارة المعرض</small><h1>{data.dealer.name}</h1><p>{data.dealer.status === 'Verified' ? 'معرض موثّق' : data.dealer.status}</p></div></div><div className={current ? 'subscription-summary active' : 'subscription-summary'}><CreditCard size={20} /><div><small>الاشتراك الحالي</small><strong>{current?.plan.name ?? 'لا يوجد اشتراك نشط'}</strong>{current?.endsAt && <span>ينتهي {new Date(current.endsAt).toLocaleDateString('ar-LY')}</span>}</div></div></section>
    {message && <div className="form-success"><CheckCircle2 size={17} />{message}</div>}
    {error && <div className="auth-error">{error}</div>}
    <section className="dealer-metrics"><article><CarFront size={20} /><strong>{data.dealer.counts.vehicles}</strong><span>السيارات</span></article><article><Users size={20} /><strong>{data.dealer.counts.staff}</strong><span>الموظفون</span></article><article><Star size={20} /><strong>{data.dealer.ratingAverage.toFixed(1)}</strong><span>{data.dealer.ratingCount} تقييم</span></article><article><CalendarDays size={20} /><strong>{current?.endsAt ? Math.max(0, Math.ceil((new Date(current.endsAt).getTime() - Date.now()) / 86_400_000)) : 0}</strong><span>يوم متبقٍ</span></article></section>

    <section className="dealer-two-columns"><form className="portal-section" onSubmit={saveProfile}><div className="section-title"><div><small>الملف التجاري</small><h2>إعدادات الحساب</h2></div><Building2 size={21} /></div><label><span>اسم المعرض</span><input name="name" required defaultValue={data.dealer.name} /></label><label><span>المدينة</span><select name="cityId" defaultValue={data.dealer.city?.id ?? ''}><option value="">اختر المدينة</option>{cities.map((city) => <option key={city.id} value={city.id}>{city.nameAr}</option>)}</select></label><label><span>العنوان</span><input name="address" defaultValue={data.dealer.address ?? ''} /></label><label><span>رقم الترخيص</span><input name="licenseNumber" defaultValue={data.dealer.licenseNumber ?? ''} /></label><button className="auth-submit" disabled={busy === 'profile'}>{busy === 'profile' ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />} حفظ الإعدادات</button></form>
      <section className="portal-section"><div className="section-title"><div><small>الحالة المالية</small><h2>الاشتراك والمدفوعات</h2></div><CreditCard size={21} /></div>{current ? <><div className="current-plan"><BadgeCheck size={25} /><div><strong>{current.plan.name}</strong><p>{current.plan.priceLyd.toLocaleString('ar-LY')} د.ل لكل {current.plan.durationDays} يوم</p><small>حتى {new Date(current.endsAt!).toLocaleString('ar-LY')}</small></div></div><div className="plan-usage"><div><span>استخدام السيارات</span><strong>{data.vehicles.length} / {current.plan.vehicleLimit ?? 'غير محدود'}</strong></div>{current.plan.vehicleLimit != null && <progress max="100" value={vehicleUsage} />}</div></> : <p className="muted-copy">اختر خطة من القائمة لتفعيل أدوات المعرض.</p>}{data.upcomingSubscription && <div className="pending-plan">التجديد القادم: {data.upcomingSubscription.plan.name} من {new Date(data.upcomingSubscription.startsAt!).toLocaleDateString('ar-LY')}</div>}{data.orders.filter((order) => order.status === 'PaymentPending').map((order) => <div className="portal-payment" key={order.id}><div><strong>{order.totalLyd.toLocaleString('ar-LY')} {order.currency}</strong><small>طلب اشتراك بانتظار الدفع</small></div><button disabled={!providers.length || busy === order.id} onClick={() => void pay(order.id)}>{providers.length ? `دفع عبر ${providers[0].name}` : 'بوابة الدفع غير مفعلة'}</button></div>)}</section>
    </section>

    <section className="dealer-inventory"><div className="portal-section"><div className="section-title"><div><small>ضمن حدود الخطة</small><h2>سيارات المعرض</h2></div><CarFront size={21} /></div><div className="dealer-vehicle-list">{data.vehicles.map((vehicle) => <article className="dealer-vehicle-entry" key={vehicle.id}><div className="dealer-vehicle-summary"><div className="dealer-vehicle-thumb">{vehicle.imageUrl ? <img src={mediaUrl(vehicle.imageUrl)} alt="" /> : <CarFront size={25} />}</div><div><strong>{vehicle.make} {vehicle.model} {vehicle.year}</strong><small>{vehicle.lotNumber} · {vehicle.city?.nameAr ?? 'مدينة غير محددة'} · {vehicle.images.length} صورة</small>{vehicle.auction && <a href={`/auctions/${vehicle.auction.id}`} className="dealer-auction-link">المزاد: {vehicle.auction.status} · {vehicle.auction.currentBidLyd.toLocaleString("ar-LY")} د.ل · {vehicle.auction.bidCount} مزايدة</a>}</div><span className={`vehicle-state state-${vehicle.approvalStatus.toLowerCase()}`}>{vehicle.approvalStatus}</span>{['Draft', 'Rejected'].includes(vehicle.approvalStatus) && <button disabled={!canCreateListing || busy === vehicle.id} onClick={() => void submitVehicle(vehicle.id)}><CheckCircle2 size={16} /> إرسال للمراجعة</button>}</div><div className="dealer-vehicle-gallery">{vehicle.images.map((image) => <div key={image.id}><img src={mediaUrl(image.url)} alt="" /><button type="button" title="حذف الصورة" disabled={busy === `image:${image.id}`} onClick={() => void deleteVehicleImage(vehicle.id, image.id)}><Trash2 size={14} /></button></div>)}</div>{vehicle.approvalStatus !== 'Archived' && <form className="vehicle-image-upload" onSubmit={(event) => void uploadVehicleImages(event, vehicle.id)}><label><ImagePlus size={16} /><span>اختيار الصور</span><input required multiple name="images" type="file" accept="image/png,image/jpeg,image/webp" /></label><button type="submit" disabled={busy === `images:${vehicle.id}`}>{busy === `images:${vehicle.id}` ? <LoaderCircle className="spin" size={16} /> : <ImagePlus size={16} />} رفع</button></form>}</article>)}</div>{!data.vehicles.length && <p className="muted-copy">لم تضف سيارات للمعرض بعد.</p>}</div><form className="portal-section" onSubmit={createVehicle}><div className="section-title"><div><small>تُحفظ كمسودة أولاً</small><h2>إضافة سيارة</h2></div><CarFront size={21} /></div>{vehicleLimitReached && <div className="plan-limit-warning">وصلت إلى حد السيارات في باقتك. جدّد أو اختر باقة أعلى لإضافة سيارة جديدة.</div>}<div className="compact-vehicle-form"><label><span>الشركة *</span><input required name="make" /></label><label><span>الموديل *</span><input required name="model" /></label><label><span>السنة *</span><input required type="number" min="1950" max="2100" name="year" defaultValue={new Date().getFullYear()} /></label><label><span>المدينة *</span><select required name="cityId" defaultValue={data.dealer.city?.id ?? cities[0]?.id ?? ''}>{cities.map((city) => <option key={city.id} value={city.id}>{city.nameAr}</option>)}</select></label><label><span>نوع البيع *</span><select name="saleType" defaultValue="FixedPrice"><option value="FixedPrice">سعر ثابت</option><option value="Negotiable">تفاوض</option><option value="QuickSale">بيع سريع</option><option value="Auction">مزاد</option></select></label><label><span>الحالة *</span><select name="condition" defaultValue="Used"><option value="Used">مستعملة</option><option value="New">جديدة</option><option value="Excellent">ممتازة</option><option value="Accident">تعرضت لحادث</option><option value="NeedsRepair">تحتاج إصلاح</option><option value="Runs">تعمل</option><option value="NotRunning">لا تعمل</option></select></label><label><span>السعر د.ل</span><input type="number" min="0" step="0.001" name="priceLyd" /></label><label><span>العداد كم</span><input type="number" min="0" name="mileageKm" /></label></div><button className="auth-submit" disabled={!canCreateListing || vehicleLimitReached || busy === 'vehicle'}>{busy === 'vehicle' ? <LoaderCircle className="spin" size={18} /> : <CarFront size={18} />}{!current ? 'يتطلب اشتراكًا نشطًا' : !canCreateListing ? 'الإضافة غير مشمولة في الباقة' : vehicleLimitReached ? 'تم بلوغ حد السيارات' : 'حفظ السيارة'}</button></form><form className="portal-section dealer-auction-request" onSubmit={requestAuction}><div className="section-title"><div><small>محسوب من حد المزادات في خطتك</small><h2>إرسال سيارة إلى المزاد</h2></div><CreditCard size={21} /></div><label><span>نوع المزاد</span><select value={rollingRound ? "rolling" : "scheduled"} onChange={(event) => setRollingRound(event.target.value === "rolling")}><option value="rolling">جولة سريعة تتجدد بعد المزايدة</option><option value="scheduled">موعد نهاية ثابت</option></select></label><div className="compact-vehicle-form"><label><span>السيارة *</span><select required name="vehicleId"><option value="">اختر مسودة</option>{data.vehicles.filter((vehicle) => ['Draft', 'Rejected'].includes(vehicle.approvalStatus)).map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.make} {vehicle.model} · {vehicle.lotNumber}</option>)}</select></label><label><span>السعر الابتدائي *</span><input required type="number" min="0.001" step="0.001" name="startingPriceLyd" /></label><label><span>البداية *</span><input required type="datetime-local" name="startsAt" defaultValue={localDate(24)} /></label>{!rollingRound && <label><span>النهاية *</span><input required type="datetime-local" name="endsAt" defaultValue={localDate(72)} /></label>}<label><span>الزيادة الدنيا</span><input type="number" min="0.001" step="0.001" name="bidIncrementLyd" /></label><label><span>السعر الاحتياطي</span><input type="number" min="0" step="0.001" name="reservePriceLyd" /></label></div><button className="auth-submit" disabled={!canCreateAuction || !data.vehicles.some((vehicle) => ['Draft', 'Rejected'].includes(vehicle.approvalStatus)) || busy === 'auction-request'}>{busy === 'auction-request' ? <LoaderCircle className="spin" size={18} /> : <CreditCard size={18} />} {!current ? 'يتطلب اشتراكًا نشطًا' : canCreateAuction ? 'إرسال طلب المزاد' : 'المزاد غير مشمول في الباقة'}</button></form></section>

    <section className="portal-section dealer-plans"><div className="section-title"><div><small>يمكن التجديد أو تغيير الخطة</small><h2>خطط الاشتراك</h2></div></div><div>{data.plans.map((plan) => <article key={plan.id}><h3>{plan.name}</h3><strong>{plan.priceLyd.toLocaleString('ar-LY')} د.ل</strong><p>{plan.description || `${plan.durationDays} يوم`}</p><ul><li>{plan.vehicleLimit ?? 'عدد غير محدود'} سيارة</li><li>{plan.auctionLimit ?? 'عدد غير محدود'} مزاد</li><li>{plan.staffLimit ?? 'عدد غير محدود'} موظف</li></ul><div className="dealer-plan-permissions">{plan.permissions.slice(0, 5).map((permission) => <span key={permission}><CheckCircle2 size={13} /> {permissionLabels[permission] ?? permission}</span>)}{plan.permissions.length > 5 && <small>+{plan.permissions.length - 5} مزايا أخرى</small>}</div><button disabled={busy === plan.id} onClick={() => void subscribe(plan)}>{busy === plan.id ? <LoaderCircle className="spin" size={17} /> : <CreditCard size={17} />}{current?.plan.id === plan.id ? 'تجديد الخطة' : 'اختيار الخطة'}</button></article>)}</div></section>

    <section className="portal-section"><div className="section-title"><div><small>تعليقات العملاء الظاهرة</small><h2>آخر التقييمات</h2></div><MessageSquareText size={21} /></div>{data.reviews.map((review) => <article className="dealer-review" key={review.id}><div><strong>{review.reviewerName}</strong><span>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span></div><p>{review.comment || 'تقييم دون تعليق'}</p><time>{new Date(review.createdAt).toLocaleDateString('ar-LY')}</time></article>)}{!data.reviews.length && <p className="muted-copy">لا توجد تقييمات للمعرض بعد.</p>}</section>
  </main>;
}
