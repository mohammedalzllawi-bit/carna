'use client';

import { ArrowRight, CarFront, CheckCircle2, CreditCard, Gavel, LoaderCircle, ShieldCheck } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';

type City = { id: string; nameAr: string; regions: { id: string; nameAr: string }[] };
type Provider = { code: string; name: string };
type Listing = { id: string; status: string; totalLyd: number; expiresAt: string | null; createdAt: string; vehicle: { lotNumber: string; make: string; model: string; year: number; approvalStatus: string; auctionId: string | null } | null };

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store', headers: { 'content-type': 'application/json', ...init?.headers } });
  const body = await response.json() as T & { message?: string | string[] };
  if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join('، ') : body.message || 'تعذر تنفيذ العملية');
  return body;
}

function localDate(offsetHours: number) {
  const date = new Date(Date.now() + offsetHours * 3_600_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function SellByAuctionPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [cityId, setCityId] = useState('');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [feeLyd, setFeeLyd] = useState<number | null>(null);
  const [rollingRound, setRollingRound] = useState(true);
  const [roundSeconds, setRoundSeconds] = useState(120);
  const [loading, setLoading] = useState(true);
  const [subscriptionRequired, setSubscriptionRequired] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const [settings, cityData, providerData, listingData] = await Promise.all([
        json<Record<string, unknown>>('/api/platform/settings/public'), json<City[]>('/api/platform/catalog/cities'),
        json<Provider[]>('/api/platform/payments/providers'), json<Listing[]>('/api/platform/auction-listings'),
      ]);
      setCities(cityData); setCityId((current) => current || cityData[0]?.id || ''); setProviders(providerData); setListings(listingData);
      setFeeLyd(Number(settings['auction.listing_fee_milli'] ?? 0) / 1000);
      setRoundSeconds(Number(settings['auction.round_seconds'] ?? 120));
      setSubscriptionRequired(settings['auction.publisher_subscription_required'] !== false);
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : 'تعذر تحميل خدمة المزاد';
      if (text.includes('access_token') || text.includes('session')) window.location.href = '/auth?returnTo=/sell/auction';
      else setError(text);
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy('create'); setError(''); setMessage('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const payload = { ...values, year: Number(values.year), mileageKm: values.mileageKm ? Number(values.mileageKm) : undefined,
      regionId: values.regionId || undefined, bidIncrementLyd: values.bidIncrementLyd || undefined, reservePriceLyd: values.reservePriceLyd || undefined,
      startsAt: new Date(String(values.startsAt)).toISOString(), rollingRound,
      endsAt: rollingRound ? undefined : new Date(String(values.endsAt)).toISOString() };
    try {
      const result = await json<{ paymentRequired: boolean }>('/api/platform/auction-listings', { method: 'POST', body: JSON.stringify(payload) });
      (event.currentTarget as HTMLFormElement).reset();
      setMessage(result.paymentRequired ? 'تم إنشاء الطلب. ادفع الرسوم من قائمة طلباتك ليصل إلى مراجعة الإدارة.' : 'تم إرسال الطلب للمراجعة دون رسوم.');
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر إنشاء طلب المزاد'); }
    finally { setBusy(''); }
  }

  async function pay(listing: Listing) {
    const provider = providers[0];
    if (!provider) { setError('لا توجد بوابة دفع إلكترونية مفعلة بوثائق رسمية حاليًا. يبقى الطلب محفوظًا حتى تفعيل بوابة من الإدارة.'); return; }
    setBusy(listing.id); setError('');
    try {
      const result = await json<{ checkoutUrl?: string }>('/api/platform/payments', { method: 'POST', body: JSON.stringify({ orderId: listing.id, provider: provider.code, idempotencyKey: crypto.randomUUID() }) });
      if (result.checkoutUrl?.startsWith('https://')) window.location.href = result.checkoutUrl;
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر بدء الدفع'); }
    finally { setBusy(''); }
  }

  const regions = cities.find((city) => city.id === cityId)?.regions ?? [];
  return <main className="auction-submit-page">
    <header className="market-heading"><a href="/account"><ArrowRight size={17} /> حسابي</a><span className="eyebrow">بيع عبر مزاد موثّق</span><h1>أضف سيارتك إلى المزاد</h1><p>تظهر الرسوم كاملة قبل إرسال الطلب، ولا يبدأ المزاد إلا بعد الدفع ومراجعة الإدارة.</p></header>
    <section className="auction-fee-band"><Gavel size={26} /><div><small>رسوم إدخال الطلب التي حددتها الإدارة</small><strong>{feeLyd === null ? '...' : `${feeLyd.toLocaleString('ar-LY')} د.ل`}</strong><p>الدفع لا يعني قبول السيارة تلقائيًا. في حال رفض طلب مدفوع يُحال المبلغ لمراجعة الاسترداد.</p></div></section>
    {subscriptionRequired && <p className="auction-commitment"><ShieldCheck size={20} /> النشر يتطلب اشتراكًا فعّالًا وحصة مزادات متاحة. <a href="/workspace?tab=subscriptions">اشتراكات النشر</a></p>}
    {message && <div className="form-success"><CheckCircle2 size={17} />{message}</div>}
    {error && <div className="auth-error">{error}</div>}
    {loading ? <div className="account-state"><LoaderCircle className="spin" size={24} /> جارٍ تحميل الخدمة...</div> : <form className="auction-submit-form" onSubmit={submit}>
      <div className="section-title"><div><small>بيانات السيارة</small><h2>المعلومات الأساسية</h2></div><CarFront size={22} /></div>
      <div className="auction-form-grid"><label><span>تصنيف المركبة *</span><select name="category" required><option value="Car">سيارة</option><option value="Truck">شاحنة</option><option value="Motorcycle">دراجة نارية</option><option value="Bicycle">دراجة هوائية</option><option value="Other">أخرى</option></select></label></div>
      <div className="auction-form-grid"><label><span>الشركة *</span><input required name="make" maxLength={80} placeholder="تويوتا" /></label><label><span>الموديل *</span><input required name="model" maxLength={80} placeholder="كامري" /></label><label><span>الفئة</span><input name="trim" maxLength={80} /></label><label><span>سنة الصنع *</span><input required name="year" type="number" min="1950" max="2100" defaultValue={new Date().getFullYear()} /></label><label><span>المدينة *</span><select required name="cityId" value={cityId} onChange={(event) => setCityId(event.target.value)}>{cities.map((city) => <option key={city.id} value={city.id}>{city.nameAr}</option>)}</select></label><label><span>المنطقة</span><select name="regionId"><option value="">غير محددة</option>{regions.map((region) => <option key={region.id} value={region.id}>{region.nameAr}</option>)}</select></label><label><span>الحالة *</span><select required name="condition" defaultValue="Used"><option value="Used">مستعملة</option><option value="New">جديدة</option><option value="Excellent">ممتازة</option><option value="Accident">تعرضت لحادث</option><option value="NeedsRepair">تحتاج إصلاح</option><option value="Runs">تعمل</option><option value="NotRunning">لا تعمل</option></select></label><label><span>العداد كم</span><input name="mileageKm" type="number" min="0" /></label><label><span>اللون الخارجي</span><input name="exteriorColor" maxLength={60} /></label><label><span>الوقود</span><input name="fuelType" maxLength={60} /></label><label><span>ناقل الحركة</span><input name="transmission" maxLength={60} /></label><label><span>نوع الهيكل</span><input name="bodyType" maxLength={60} /></label><label className="wide"><span>مكان السيارة</span><input name="address" maxLength={250} /></label></div>
      <div className="section-title auction-schedule-title"><div><small>اقتراح الجدول والسعر</small><h2>إعدادات المزاد</h2></div><Gavel size={22} /></div>
      <label className="auction-description-field"><span>وصف المزاد</span><textarea name="description" maxLength={2000} rows={4} placeholder="صف حالة المركبة وأي ملاحظات أو شروط للاستلام" /></label>
      <div className="auction-form-grid"><label><span>نوع المزاد</span><select value={rollingRound ? 'rolling' : 'scheduled'} onChange={(event) => setRollingRound(event.target.value === 'rolling')}><option value="rolling">جولة سريعة · {Math.round(roundSeconds / 60)} دقائق وتتجدد بعد المزايدة</option><option value="scheduled">موعد نهاية ثابت</option></select></label><label><span>موعد البداية *</span><input required name="startsAt" type="datetime-local" defaultValue={localDate(24)} /></label>{!rollingRound && <label><span>موعد النهاية *</span><input required name="endsAt" type="datetime-local" defaultValue={localDate(72)} /></label>}<label><span>السعر الابتدائي د.ل *</span><input required name="startingPriceLyd" type="number" min="0.001" step="0.001" /></label><label><span>الزيادة الدنيا د.ل</span><input name="bidIncrementLyd" type="number" min="0.001" step="0.001" /></label><label><span>السعر الاحتياطي د.ل</span><input name="reservePriceLyd" type="number" min="0" step="0.001" /></label></div>
      <div className="auction-commitment"><ShieldCheck size={22} /><div><strong>قبل الإرسال</strong><p>ستُحفظ السيارة كمسودة. بعد تأكيد الدفع تنتقل للمراجعة، ويمكن للإدارة تعديل الجدول أو رفض الطلب بسبب البيانات الناقصة مع توثيق القرار.</p></div></div>
      <button className="auth-submit auction-submit-button" disabled={busy === 'create'}>{busy === 'create' ? <LoaderCircle className="spin" size={19} /> : <CreditCard size={19} />} إنشاء طلب بقيمة {feeLyd?.toLocaleString('ar-LY') ?? '...'} د.ل</button>
    </form>}

    <section className="listing-history"><div className="section-title"><div><small>متابعة الدفع والمراجعة</small><h2>طلباتي السابقة</h2></div></div>{listings.map((listing) => <article key={listing.id}><div><strong>{listing.vehicle ? `${listing.vehicle.make} ${listing.vehicle.model} ${listing.vehicle.year}` : 'طلب مزاد'}</strong><small>{listing.vehicle?.lotNumber} · {listing.vehicle?.approvalStatus}</small></div><div><strong>{listing.totalLyd.toLocaleString('ar-LY')} د.ل</strong><span>{listing.status}</span></div>{listing.status === 'PaymentPending' && <button disabled={!providers.length || busy === listing.id} onClick={() => void pay(listing)}>{providers.length ? `دفع عبر ${providers[0].name}` : 'الدفع غير متاح حاليًا'}</button>}{listing.vehicle?.auctionId && <a href={`/auctions/${listing.vehicle.auctionId}`}>عرض المزاد</a>}</article>)}{!listings.length && <p className="muted-copy">لم تنشئ أي طلب مزاد بعد.</p>}</section>
  </main>;
}
