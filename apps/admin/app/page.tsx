'use client';

import {
  Archive,
  BadgeCheck,
  Bell,
  Building2,
  CarFront,
  CheckCircle2,
  CircleGauge,
  CreditCard,
  ClipboardCheck,
  Edit3,
  Gavel,
  LayoutDashboard,
  LoaderCircle,
  MapPinned,
  Menu,
  MessageSquare,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

type Section = 'overview' | 'vehicles' | 'cities';
type City = { id: string; nameAr: string; nameEn?: string | null; isActive: boolean; regions: { id: string; nameAr: string; isActive: boolean }[] };
type Vehicle = {
  id: string; lotNumber: string; make: string; model: string; trim?: string | null; year: number;
  category?: 'Car' | 'Truck' | 'Motorcycle' | 'Bicycle' | 'Other';
  exteriorColor?: string | null; fuelType?: string | null; transmission?: string | null;
  mileageKm?: number | null; bodyType?: string | null; address?: string | null;
  saleType: 'Auction' | 'QuickSale' | 'FixedPrice' | 'Negotiable'; condition: string;
  approvalStatus: string; priceLyd?: number | null; city?: { id: string; nameAr: string } | null; createdAt: string;
};
type Overview = {
  counts: { vehicles: number; publishedVehicles: number; pendingVehicles: number; users: number; dealers: number; technicians: number; liveAuctions: number };
  recentVehicles: Vehicle[];
};
type VehicleForm = {
  category: NonNullable<Vehicle['category']>; make: string; model: string; trim: string; year: string; cityId: string; exteriorColor: string;
  fuelType: string; transmission: string; mileageKm: string; bodyType: string; address: string;
  saleType: Vehicle['saleType']; condition: string; priceLyd: string;
};

const emptyOverview: Overview = { counts: { vehicles: 0, publishedVehicles: 0, pendingVehicles: 0, users: 0, dealers: 0, technicians: 0, liveAuctions: 0 }, recentVehicles: [] };
const emptyForm: VehicleForm = {
  category: 'Car', make: '', model: '', trim: '', year: new Date().getFullYear().toString(), cityId: '', exteriorColor: '',
  fuelType: '', transmission: '', mileageKm: '', bodyType: '', address: '',
  saleType: 'FixedPrice', condition: 'Used', priceLyd: '',
};
const navigation = [
  { id: 'overview' as const, label: 'نظرة عامة', icon: LayoutDashboard },
  { id: 'vehicles' as const, label: 'إدارة المركبات', icon: CarFront },
  { id: 'cities' as const, label: 'المدن والمناطق', icon: MapPinned },
];
const statusLabels: Record<string, string> = { Draft: 'مسودة', PendingReview: 'بانتظار المراجعة', Approved: 'معتمدة', Rejected: 'مرفوضة', Published: 'منشورة', Archived: 'مؤرشفة' };
const saleTypeLabels: Record<Vehicle['saleType'], string> = { Auction: 'مزاد', QuickSale: 'بيع سريع', FixedPrice: 'سعر ثابت', Negotiable: 'قابل للتفاوض' };
const categoryLabels: Record<NonNullable<Vehicle['category']>, string> = { Car: 'سيارة', Truck: 'شاحنة', Motorcycle: 'دراجة نارية', Bicycle: 'دراجة هوائية', Other: 'أخرى' };

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const data = (await response.json()) as T & { message?: string | string[] };
  if (!response.ok) {
    const message = Array.isArray(data.message) ? data.message.join('، ') : data.message;
    throw new Error(message || 'تعذر تنفيذ العملية');
  }
  return data;
}

export default function AdminDashboard() {
  const [section, setSection] = useState<Section>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [overview, setOverview] = useState<Overview>(emptyOverview);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleForm>(emptyForm);
  const [newCity, setNewCity] = useState({ nameAr: '', nameEn: '' });

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [overviewData, vehicleData, cityData] = await Promise.all([
        fetchJson<Overview>('/api/admin/overview'), fetchJson<Vehicle[]>('/api/admin/vehicles'), fetchJson<City[]>('/api/admin/cities'),
      ]);
      setOverview(overviewData); setVehicles(vehicleData); setCities(cityData);
      setForm((current) => ({ ...current, cityId: current.cityId || cityData[0]?.id || '' }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر تحميل بيانات لوحة الإدارة'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const filteredVehicles = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return vehicles;
    return vehicles.filter((vehicle) => [vehicle.make, vehicle.model, vehicle.lotNumber, vehicle.city?.nameAr].filter(Boolean).some((field) => field?.toLowerCase().includes(value)));
  }, [search, vehicles]);

  function chooseSection(nextSection: Section) { setSection(nextSection); setMenuOpen(false); setMessage(''); setError(''); }
  function openCreateForm() { setEditingId(null); setForm({ ...emptyForm, cityId: cities[0]?.id ?? '' }); setFormOpen(true); }
  function openEditForm(vehicle: Vehicle) {
    setEditingId(vehicle.id);
    setForm({
      category: vehicle.category ?? 'Car', make: vehicle.make, model: vehicle.model, trim: vehicle.trim ?? '', year: vehicle.year.toString(),
      cityId: vehicle.city?.id ?? cities[0]?.id ?? '', exteriorColor: vehicle.exteriorColor ?? '', fuelType: vehicle.fuelType ?? '',
      transmission: vehicle.transmission ?? '', mileageKm: vehicle.mileageKm?.toString() ?? '', bodyType: vehicle.bodyType ?? '',
      address: vehicle.address ?? '', saleType: vehicle.saleType, condition: vehicle.condition, priceLyd: vehicle.priceLyd?.toString() ?? '',
    });
    setFormOpen(true);
  }

  async function saveVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    const payload = { ...form, year: Number(form.year), mileageKm: form.mileageKm ? Number(form.mileageKm) : undefined, priceLyd: form.priceLyd ? Number(form.priceLyd) : undefined };
    try {
      await fetchJson(editingId ? `/api/admin/vehicles/${editingId}` : '/api/admin/vehicles', { method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      setFormOpen(false); setMessage(editingId ? 'تم حفظ تعديلات السيارة.' : 'تمت إضافة السيارة كمسودة برقم تلقائي.');
      await loadData(); setSection('vehicles');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر حفظ السيارة'); }
    finally { setSaving(false); }
  }

  async function publishVehicle(id: string) {
    setError('');
    try { await fetchJson(`/api/admin/vehicles/${id}/publish`, { method: 'POST' }); setMessage('تم نشر السيارة وأصبحت ظاهرة في الموقع والتطبيق.'); await loadData(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر نشر السيارة'); }
  }
  async function archiveVehicle(id: string) {
    if (!window.confirm('هل تريد أرشفة هذه السيارة؟ لن تُحذف سجلاتها نهائياً.')) return;
    setError('');
    try { await fetchJson(`/api/admin/vehicles/${id}`, { method: 'DELETE' }); setMessage('تمت أرشفة السيارة مع الاحتفاظ بسجل العملية.'); await loadData(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر أرشفة السيارة'); }
  }
  async function addCity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    try { await fetchJson('/api/admin/cities', { method: 'POST', body: JSON.stringify(newCity) }); setNewCity({ nameAr: '', nameEn: '' }); setMessage('تمت إضافة المدينة.'); await loadData(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر إضافة المدينة'); }
    finally { setSaving(false); }
  }
  async function toggleCity(city: City) {
    setError('');
    try { await fetchJson(`/api/admin/cities/${city.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !city.isActive }) }); await loadData(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر تحديث المدينة'); }
  }

  const pageTitle = section === 'overview' ? 'نظرة عامة' : section === 'vehicles' ? 'إدارة السيارات' : 'المدن والمناطق';
  return (
    <div className="admin-shell">
      <aside className={menuOpen ? 'sidebar sidebar-open' : 'sidebar'}>
        <div className="brand"><span className="brand-mark"><Gavel size={19} /></span><span><strong>سوق بنغازي</strong><small>لوحة الإدارة</small></span></div>
        <nav aria-label="التنقل الرئيسي">{navigation.map(({ id, label, icon: Icon }) => <button className={section === id ? 'nav-item active' : 'nav-item'} key={id} type="button" onClick={() => chooseSection(id)}><Icon size={19} /><span>{label}</span></button>)}<a className="nav-item" href="/users"><Users size={19} /><span>إدارة المستخدمين</span></a><a className="nav-item" href="/dealers"><Building2 size={19} /><span>المعارض والاشتراكات</span></a><a className="nav-item" href="/technicians"><Wrench size={19} /><span>الفنيون والكهربائيون</span></a><a className="nav-item" href="/settings"><Settings size={19} /><span>إعدادات النظام</span></a></nav>
        <div className="module-list"><span>وحدات النظام</span><a href="/operations?view=subscriptions"><CreditCard size={14} /> اشتراكات النشر</a><a href="/operations?view=content"><ClipboardCheck size={14} /> الشروط والسياسات</a><a href="/operations?view=requests"><MessageSquare size={14} /> الطلبات</a><a href="/operations?view=withdrawals"><CreditCard size={14} /> استرداد المحفظة</a><a href="/operations?view=reviews"><ClipboardCheck size={14} /> التقييمات</a><a href="/auctions"><Gavel size={14} /> المزادات</a><a href="/notifications"><Bell size={14} /> الإشعارات</a><a href="/messages"><MessageSquare size={14} /> الرسائل</a><a href="/payments"><CreditCard size={14} /> المدفوعات</a><a href="/roles"><Users size={14} /> الأدوار والصلاحيات</a><a href="/audit"><ClipboardCheck size={14} /> سجل التدقيق</a><button className="secondary-button" onClick={async () => { await fetch('/api/admin-session/logout', { method: 'POST' }); location.href = '/login'; }}>تسجيل الخروج</button></div>
        <div className="system-state"><span className={error ? 'status-dot down' : 'status-dot'} /><div><strong>{error ? 'تحقق من الاتصال' : 'متصل بقاعدة البيانات'}</strong><small>MongoDB عبر NestJS API</small></div></div>
      </aside>

      <main className="dashboard">
        <header className="topbar"><button className="icon-button menu-button" title="فتح القائمة" type="button" onClick={() => setMenuOpen(!menuOpen)}><Menu size={21} /></button><div className="page-title"><h1>{pageTitle}</h1><p>بيانات مباشرة من النظام</p></div><div className="topbar-actions"><button className="icon-button" title="تحديث البيانات" type="button" onClick={() => void loadData()}><RefreshCw size={19} /></button><a className="icon-button notification-button" title="الإشعارات" href="/notifications"><Bell size={20} /></a><div className="admin-user"><span>م ت</span><div><strong>مدير النظام</strong><small>إدارة محلية محمية</small></div></div></div></header>
        {message ? <div className="notice success"><CheckCircle2 size={18} />{message}</div> : null}
        {error ? <div className="notice error"><CircleGauge size={18} />{error}</div> : null}
        {loading ? <div className="loading-state"><LoaderCircle size={25} className="spin" /> جارٍ تحميل البيانات...</div> : null}

        {!loading && section === 'overview' ? <><section className="stats-grid" aria-label="المؤشرات الرئيسية">
          <StatCard label="كل السيارات" value={overview.counts.vehicles} icon={CarFront} tone="teal" />
          <StatCard label="السيارات المنشورة" value={overview.counts.publishedVehicles} icon={BadgeCheck} tone="green" />
          <StatCard label="بانتظار المراجعة" value={overview.counts.pendingVehicles} icon={ClipboardCheck} tone="amber" />
          <StatCard label="مزادات مباشرة" value={overview.counts.liveAuctions} icon={Gavel} tone="red" />
          <StatCard label="المستخدمون" value={overview.counts.users} icon={Users} tone="gray" />
          <StatCard label="المعارض" value={overview.counts.dealers} icon={Building2} tone="blue" />
          <StatCard label="الفنيون" value={overview.counts.technicians} icon={Wrench} tone="teal" />
        </section><section className="panel overview-panel"><div className="panel-header"><div><p className="eyebrow">آخر البيانات</p><h2>السيارات المضافة حديثاً</h2></div><button className="primary-button" type="button" onClick={openCreateForm}><Plus size={18} /> إضافة سيارة</button></div><VehicleTable vehicles={overview.recentVehicles} onEdit={openEditForm} onPublish={publishVehicle} onArchive={archiveVehicle} compact /></section></> : null}

        {!loading && section === 'vehicles' ? <section className="panel vehicles-panel"><div className="panel-header toolbar"><label className="admin-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالسيارة أو رقمها أو المدينة" /></label><button className="primary-button" type="button" onClick={openCreateForm}><Plus size={18} /> إضافة سيارة حقيقية</button></div><VehicleTable vehicles={filteredVehicles} onEdit={openEditForm} onPublish={publishVehicle} onArchive={archiveVehicle} /></section> : null}

        {!loading && section === 'cities' ? <section className="cities-layout"><form className="panel city-form" onSubmit={addCity}><div className="panel-header"><div><p className="eyebrow">إعدادات الموقع</p><h2>إضافة مدينة</h2></div><MapPinned size={21} /></div><label><span>الاسم بالعربية</span><input required value={newCity.nameAr} onChange={(event) => setNewCity({ ...newCity, nameAr: event.target.value })} placeholder="مثال: البيضاء" /></label><label><span>الاسم بالإنجليزية</span><input value={newCity.nameEn} onChange={(event) => setNewCity({ ...newCity, nameEn: event.target.value })} placeholder="Al Bayda" dir="ltr" /></label><button className="primary-button" disabled={saving} type="submit"><Plus size={18} /> إضافة المدينة</button></form><section className="panel city-list"><div className="panel-header"><div><p className="eyebrow">{cities.length} مدينة</p><h2>المدن المعتمدة</h2></div></div>{cities.map((city) => <div className="city-row" key={city.id}><span className="city-icon"><MapPinned size={19} /></span><div><strong>{city.nameAr}</strong><small>{city.nameEn || 'بدون ترجمة'} · {city.regions.length} منطقة</small></div><button className={city.isActive ? 'state-button active' : 'state-button'} type="button" onClick={() => void toggleCity(city)}>{city.isActive ? 'نشطة' : 'موقوفة'}</button></div>)}</section></section> : null}
      </main>

      {formOpen ? <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setFormOpen(false)}><form className="vehicle-form" onSubmit={saveVehicle}><div className="form-header"><div><p>{editingId ? 'تعديل البيانات' : 'إدخال جديد'}</p><h2>{editingId ? 'تعديل السيارة' : 'إضافة سيارة إلى النظام'}</h2></div><button className="icon-button" type="button" title="إغلاق" onClick={() => setFormOpen(false)}><X size={20} /></button></div><div className="form-grid">
        <Field label="التصنيف *"><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as VehicleForm['category'] })}>{Object.entries(categoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        <Field label="الشركة *"><input required value={form.make} onChange={(event) => setForm({ ...form, make: event.target.value })} placeholder="تويوتا" /></Field>
        <Field label="الموديل *"><input required value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} placeholder="كامري" /></Field>
        <Field label="الفئة"><input value={form.trim} onChange={(event) => setForm({ ...form, trim: event.target.value })} placeholder="GLX" /></Field>
        <Field label="سنة الصنع *"><input required min="1950" max="2100" type="number" value={form.year} onChange={(event) => setForm({ ...form, year: event.target.value })} /></Field>
        <Field label="المدينة *"><select required value={form.cityId} onChange={(event) => setForm({ ...form, cityId: event.target.value })}><option value="">اختر المدينة</option>{cities.filter((city) => city.isActive).map((city) => <option key={city.id} value={city.id}>{city.nameAr}</option>)}</select></Field>
        <Field label="نوع البيع *"><select value={form.saleType} onChange={(event) => setForm({ ...form, saleType: event.target.value as Vehicle['saleType'] })}>{Object.entries(saleTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="السعر بالدينار"><input min="0" step="0.001" type="number" value={form.priceLyd} onChange={(event) => setForm({ ...form, priceLyd: event.target.value })} placeholder="85000" /></Field>
        <Field label="العداد بالكيلومتر"><input min="0" type="number" value={form.mileageKm} onChange={(event) => setForm({ ...form, mileageKm: event.target.value })} placeholder="65000" /></Field>
        <Field label="الحالة"><select value={form.condition} onChange={(event) => setForm({ ...form, condition: event.target.value })}><option value="New">جديدة</option><option value="Used">مستعملة</option><option value="Excellent">ممتازة</option><option value="Accident">تعرضت لحادث</option><option value="NeedsRepair">تحتاج إصلاح</option><option value="Runs">تعمل</option><option value="NotRunning">لا تعمل</option></select></Field>
        <Field label="نوع الهيكل"><input value={form.bodyType} onChange={(event) => setForm({ ...form, bodyType: event.target.value })} placeholder="سيدان" /></Field>
        <Field label="الوقود"><input value={form.fuelType} onChange={(event) => setForm({ ...form, fuelType: event.target.value })} placeholder="بنزين" /></Field>
        <Field label="ناقل الحركة"><input value={form.transmission} onChange={(event) => setForm({ ...form, transmission: event.target.value })} placeholder="أوتوماتيك" /></Field>
        <Field label="اللون الخارجي"><input value={form.exteriorColor} onChange={(event) => setForm({ ...form, exteriorColor: event.target.value })} placeholder="أبيض" /></Field>
        <Field label="مكان السيارة"><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="بنغازي، المنطقة" /></Field>
      </div><div className="form-note">تُحفظ السيارة كمسودة أولاً. استخدم زر النشر بعد مراجعة البيانات لتظهر في الموقع والتطبيق.</div><div className="form-actions"><button className="secondary-button" type="button" onClick={() => setFormOpen(false)}>إلغاء</button><button className="primary-button" disabled={saving} type="submit">{saving ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />} حفظ السيارة</button></div></form></div> : null}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof CarFront; tone: string }) { return <article className="stat-card"><span className={`stat-icon ${tone}`}><Icon size={21} /></span><div><p>{label}</p><strong>{value.toLocaleString('ar-LY')}</strong><small>من قاعدة البيانات</small></div></article>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="form-field"><span>{label}</span>{children}</label>; }
function VehicleTable({ vehicles, onEdit, onPublish, onArchive, compact = false }: { vehicles: Vehicle[]; onEdit: (vehicle: Vehicle) => void; onPublish: (id: string) => Promise<void>; onArchive: (id: string) => Promise<void>; compact?: boolean }) {
  if (!vehicles.length) return <div className="empty-state"><CarFront size={34} /><h3>لا توجد سيارات بعد</h3><p>أضف أول سيارة من لوحة الإدارة، ثم راجعها وانشرها.</p></div>;
  return <div className="table-wrap"><table><thead><tr><th>المركبة</th><th>التصنيف</th><th>رقم العرض</th><th>المدينة</th><th>نوع البيع</th><th>السعر</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{vehicles.map((vehicle) => <tr key={vehicle.id}><td><strong>{vehicle.make} {vehicle.model}</strong><small>{vehicle.year}{vehicle.trim ? ` · ${vehicle.trim}` : ''}</small></td><td>{categoryLabels[vehicle.category ?? 'Car']}</td><td dir="ltr">{vehicle.lotNumber}</td><td>{vehicle.city?.nameAr ?? 'غير محددة'}</td><td>{saleTypeLabels[vehicle.saleType]}</td><td>{vehicle.priceLyd == null ? 'يحدد لاحقاً' : `${vehicle.priceLyd.toLocaleString('ar-LY')} د.ل`}</td><td><span className={`status-chip status-${vehicle.approvalStatus.toLowerCase()}`}>{statusLabels[vehicle.approvalStatus] ?? vehicle.approvalStatus}</span></td><td><div className="row-actions"><button type="button" title="تعديل" onClick={() => onEdit(vehicle)}><Edit3 size={16} /></button>{vehicle.approvalStatus !== 'Published' ? <button className="publish" type="button" title="نشر" onClick={() => void onPublish(vehicle.id)}><CheckCircle2 size={16} /></button> : null}<button className="archive" type="button" title="أرشفة" onClick={() => void onArchive(vehicle.id)}><Archive size={16} /></button></div></td></tr>)}</tbody></table>{compact && vehicles.length >= 5 ? <p className="table-note">آخر خمس مركبات فقط</p> : null}</div>;
}
