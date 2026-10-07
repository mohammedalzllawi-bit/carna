'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, ImagePlus, Send } from 'lucide-react';

type City = { id: string; nameAr: string };
type Listing = { id: string; make: string; model: string; lotNumber: string; approvalStatus: string; images: { url: string }[] };
const categories = { Car: 'سيارة', Truck: 'شاحنة', Motorcycle: 'دراجة نارية', Bicycle: 'دراجة هوائية', Other: 'أخرى' };

export default function SellPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [drafts, setDrafts] = useState<Listing[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [hasImages, setHasImages] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    void Promise.all([
      fetch('/api/platform/catalog/cities').then((response) => response.json() as Promise<City[]>),
      fetch('/api/platform/listings/mine'),
    ]).then(async ([cityData, response]) => {
      setCities(cityData);
      if (response.status === 401) { setNeedsLogin(true); return; }
      if (response.ok) setDrafts((await response.json() as Listing[]).filter((item) => ['Draft', 'Rejected'].includes(item.approvalStatus)));
    }).catch(() => setError('تعذر تحميل بيانات النشر. تحقق من الاتصال.'));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSuccess('');
    const formElement = event.currentTarget;
    if (!hasImages && files.length === 0) { setError('أضف صورة واحدة على الأقل.'); return; }
    setBusy(true);
    try {
      let id = draftId;
      if (!id) {
        const data = new FormData(formElement);
        const payload = {
          category: data.get('category'), make: data.get('make')?.toString().trim(), model: data.get('model')?.toString().trim(),
          year: Number(data.get('year')), cityId: data.get('cityId'), priceLyd: Number(data.get('priceLyd')),
          saleType: data.get('saleType'), condition: data.get('condition'),
        };
        const response = await fetch('/api/platform/listings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
        if (response.status === 401) { setNeedsLogin(true); throw new Error('سجّل الدخول أولاً لنشر مركبة.'); }
        if (!response.ok) throw new Error('تحقق من البيانات الأساسية للعرض.');
        id = (await response.json() as Listing).id;
        setDraftId(id);
      }
      if (files.length) {
        const form = new FormData();
        for (const file of files) form.append('images', file);
        const response = await fetch(`/api/platform/listings/${id}/images`, { method: 'POST', body: form });
        if (!response.ok) throw new Error('تعذر رفع الصور. المسودة محفوظة، حاول مجدداً.');
        setHasImages(true); setFiles([]);
      }
      const response = await fetch(`/api/platform/listings/${id}/submit`, { method: 'POST' });
      if (!response.ok) throw new Error('تعذر إرسال العرض للمراجعة. المسودة محفوظة، حاول مجدداً.');
      setSuccess('تم إرسال العرض للمراجعة. سيظهر للآخرين بعد موافقة الإدارة.');
      setDraftId(null); setHasImages(false);
      setDrafts((current) => current.filter((item) => item.id !== id));
      formElement.reset();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر نشر المركبة.'); }
    finally { setBusy(false); }
  }

  return <main className="sell-page" dir="rtl">
    <a href="/"><ArrowRight size={18} /> الرئيسية</a>
    <h1>اعرض مركبتك</h1>
    {needsLogin ? <p><a href="/auth">سجّل الدخول أو أنشئ حساباً</a> قبل النشر.</p> : <>
      {drafts.length > 0 && <div className="sell-drafts"><h2>مسوداتي</h2>{drafts.map((draft) => <button key={draft.id} type="button" onClick={() => { setDraftId(draft.id); setHasImages(draft.images.length > 0); setFiles([]); setError(''); }}>
        {draft.make} {draft.model} · {draft.lotNumber} {draftId === draft.id ? '✓' : ''}
      </button>)}{draftId && <button type="button" onClick={() => { setDraftId(null); setHasImages(false); setFiles([]); }}>إعلان جديد</button>}</div>}
      <form onSubmit={(event) => void submit(event)}>
        {draftId ? <p>إكمال المسودة: أضف صورة ثم أرسلها للمراجعة.</p> : <div className="sell-grid">
          <label>التصنيف<select name="category" required>{Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>الشركة أو العلامة<input name="make" required maxLength={80} placeholder="تويوتا" /></label>
          <label>الموديل أو الاسم<input name="model" required maxLength={80} placeholder="كامري" /></label>
          <label>سنة الصنع<input name="year" type="number" required min={1950} max={new Date().getFullYear() + 1} /></label>
          <label>المدينة<select name="cityId" required><option value="">اختر المدينة</option>{cities.map((city) => <option key={city.id} value={city.id}>{city.nameAr}</option>)}</select></label>
          <label>السعر بالدينار الليبي<input name="priceLyd" type="number" step="0.001" min="0.001" required /></label>
          <label>طريقة البيع<select name="saleType"><option value="FixedPrice">سعر ثابت</option><option value="Negotiable">قابل للتفاوض</option><option value="QuickSale">بيع سريع</option></select></label>
          <label>الحالة<select name="condition"><option value="Used">مستعملة</option><option value="New">جديدة</option><option value="Excellent">ممتازة</option><option value="NeedsRepair">تحتاج إصلاح</option><option value="Accident">تعرضت لحادث</option></select></label>
        </div>}
        <label className="sell-photos"><ImagePlus size={20} /> صور المركبة (صورة واحدة على الأقل)
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setFiles(Array.from(event.currentTarget.files ?? []).slice(0, 12))} />
        </label>
        {(files.length > 0 || hasImages) && <p>{hasImages ? 'صور محفوظة' : ''} {files.length ? `· ${files.length} صورة جاهزة للرفع` : ''}</p>}
        {error && <p className="detail-error" role="alert">{error}</p>}
        {success && <p className="sell-success" role="status">{success}</p>}
        <button className="sell-submit" type="submit" disabled={busy}>{busy ? 'جارٍ الإرسال...' : <><Send size={18} /> إرسال للمراجعة</>}</button>
      </form>
      <a className="sell-auction-link" href="/sell/auction">تريد إدخال المركبة في المزاد؟</a>
    </>}
  </main>;
}
