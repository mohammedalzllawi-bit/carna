'use client';

import {
  Archive,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Edit3,
  Eye,
  LoaderCircle,
  MapPin,
  Plus,
  Save,
  Search,
  Star,
  Wrench,
  X,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type City = { id: string; nameAr: string; isActive: boolean };
type Service = { id?: string; name: string; priceLyd: number | string; durationMinutes?: number | string | null };
type Technician = {
  id: string; name: string; phone: string; specialty: string; yearsExperience?: number | null;
  city?: { id: string; nameAr: string } | null; serviceRegions: string[]; basePriceLyd: number;
  availabilityStatus: string; approvalStatus: string; ratingAverage: number; completedInspections: number;
  services: { id: string; name: string; priceLyd: number; durationMinutes?: number | null }[];
};
type TechnicianForm = {
  name: string; phone: string; temporaryPassword: string; specialty: string; yearsExperience: string;
  cityId: string; serviceRegions: string; basePriceLyd: string; availabilityStatus: string; services: Service[];
};

const specialties = ['كهربائي سيارات', 'ميكانيكي', 'فني فحص كمبيوتر', 'فني محركات', 'فني شاصي وحوادث', 'فني دهان وسمكرة', 'فني فحص شامل'];
const emptyForm: TechnicianForm = {
  name: '', phone: '', temporaryPassword: '', specialty: specialties[0], yearsExperience: '', cityId: '',
  serviceRegions: '', basePriceLyd: '', availabilityStatus: 'available',
  services: [{ name: 'فحص مبدئي', priceLyd: '', durationMinutes: 60 }],
};
const statusLabels: Record<string, string> = { Draft: 'مسودة', PendingReview: 'بانتظار الاعتماد', Approved: 'معتمد', Published: 'منشور', Rejected: 'مرفوض', Archived: 'مؤرشف' };

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const data = (await response.json()) as T & { message?: string | string[] };
  if (!response.ok) {
    const message = Array.isArray(data.message) ? data.message.join('، ') : data.message;
    throw new Error(message || 'تعذر تنفيذ العملية');
  }
  return data;
}

export default function TechniciansAdminPage() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TechnicianForm>(emptyForm);

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [technicianData, cityData] = await Promise.all([
        fetchJson<Technician[]>('/api/admin/technicians'),
        fetchJson<City[]>('/api/admin/cities'),
      ]);
      setTechnicians(technicianData); setCities(cityData);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر تحميل الفنيين'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value ? technicians.filter((item) => `${item.name} ${item.specialty} ${item.phone} ${item.city?.nameAr ?? ''}`.toLowerCase().includes(value)) : technicians;
  }, [query, technicians]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm, cityId: cities.find((city) => city.isActive)?.id ?? '' });
    setFormOpen(true); setError(''); setMessage('');
  }

  function openEdit(technician: Technician) {
    setEditingId(technician.id);
    setForm({
      name: technician.name, phone: technician.phone, temporaryPassword: '', specialty: technician.specialty,
      yearsExperience: technician.yearsExperience?.toString() ?? '', cityId: technician.city?.id ?? '',
      serviceRegions: technician.serviceRegions.join('، '), basePriceLyd: technician.basePriceLyd.toString(),
      availabilityStatus: technician.availabilityStatus,
      services: technician.services.map((service) => ({ name: service.name, priceLyd: service.priceLyd, durationMinutes: service.durationMinutes ?? '' })),
    });
    setFormOpen(true); setError(''); setMessage('');
  }

  function updateService(index: number, field: keyof Service, value: string) {
    setForm((current) => ({ ...current, services: current.services.map((service, serviceIndex) => serviceIndex === index ? { ...service, [field]: value } : service) }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    const payload: Record<string, unknown> = {
      name: form.name, specialty: form.specialty, cityId: form.cityId,
      yearsExperience: form.yearsExperience ? Number(form.yearsExperience) : undefined,
      serviceRegions: form.serviceRegions.split(/[،,]/).map((value) => value.trim()).filter(Boolean),
      basePriceLyd: Number(form.basePriceLyd), availabilityStatus: form.availabilityStatus,
      services: form.services.filter((service) => service.name.trim()).map((service) => ({ name: service.name, priceLyd: Number(service.priceLyd), durationMinutes: service.durationMinutes ? Number(service.durationMinutes) : undefined })),
    };
    if (!editingId) { payload.phone = form.phone; payload.temporaryPassword = form.temporaryPassword; }
    try {
      await fetchJson(editingId ? `/api/admin/technicians/${editingId}` : '/api/admin/technicians', { method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      setFormOpen(false); setMessage(editingId ? 'تم تحديث ملف الفني.' : 'تم إنشاء حساب الفني وإرساله للمراجعة.'); await loadData();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر حفظ الفني'); }
    finally { setSaving(false); }
  }

  async function publish(id: string) {
    try { await fetchJson(`/api/admin/technicians/${id}/publish`, { method: 'POST' }); setMessage('تم اعتماد الفني ونشره للمستخدمين.'); await loadData(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر نشر الفني'); }
  }

  async function archive(id: string) {
    if (!window.confirm('أرشفة الفني وإيقاف ظهوره للمستخدمين؟')) return;
    try { await fetchJson(`/api/admin/technicians/${id}`, { method: 'DELETE' }); setMessage('تمت أرشفة الفني.'); await loadData(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر أرشفة الفني'); }
  }

  return (
    <main className="management-page">
      <header className="management-header">
        <div><a href="/"><ArrowRight size={17} /> العودة للوحة الإدارة</a><h1>الفنيون والكهربائيون</h1><p>إدارة الحسابات والتخصصات والأسعار والخدمات وحالة الاعتماد.</p></div>
        <button className="primary-button" type="button" onClick={openCreate}><Plus size={18} /> إضافة فني</button>
      </header>
      {message ? <div className="notice success"><CheckCircle2 size={18} />{message}</div> : null}
      {error ? <div className="notice error"><Wrench size={18} />{error}</div> : null}
      <section className="mini-stats"><div><strong>{technicians.length}</strong><span>إجمالي الفنيين</span></div><div><strong>{technicians.filter((item) => item.approvalStatus === 'Published').length}</strong><span>منشورون</span></div><div><strong>{technicians.filter((item) => item.approvalStatus === 'PendingReview').length}</strong><span>بانتظار الاعتماد</span></div></section>
      <section className="panel technicians-panel">
        <div className="panel-header toolbar"><label className="admin-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم أو التخصص أو الهاتف" /></label><span className="table-count">{filtered.length} نتيجة</span></div>
        {loading ? <div className="loading-state"><LoaderCircle className="spin" size={24} /> جارٍ تحميل الفنيين...</div> : filtered.length === 0 ? <div className="empty-state"><Wrench size={35} /><h3>لا يوجد فنيون بعد</h3><p>أضف كهربائياً أو ميكانيكياً ثم اعتمد ملفه للنشر.</p></div> : <div className="table-wrap"><table><thead><tr><th>الفني</th><th>التخصص</th><th>المدينة</th><th>السعر الأساسي</th><th>الخدمات</th><th>التقييم</th><th>الاعتماد</th><th>الإجراءات</th></tr></thead><tbody>{filtered.map((technician) => <tr key={technician.id}><td><strong><a href={`/technicians/${technician.id}`}>{technician.name}</a></strong><small dir="ltr">{technician.phone}</small></td><td>{technician.specialty}</td><td><span className="inline-icon"><MapPin size={14} />{technician.city?.nameAr ?? 'غير محددة'}</span></td><td>{technician.basePriceLyd.toLocaleString('ar-LY')} د.ل</td><td>{technician.services.length}</td><td><span className="inline-icon"><Star size={14} />{technician.ratingAverage.toFixed(1)}</span></td><td><span className={`status-chip status-${technician.approvalStatus.toLowerCase()}`}>{statusLabels[technician.approvalStatus] ?? technician.approvalStatus}</span></td><td><div className="row-actions"><a href={`/technicians/${technician.id}`} title="عرض التفاصيل"><Eye size={16} /></a><button title="تعديل" type="button" onClick={() => openEdit(technician)}><Edit3 size={16} /></button>{technician.approvalStatus !== 'Published' && technician.approvalStatus !== 'Archived' ? <button className="publish" title="اعتماد ونشر" type="button" onClick={() => void publish(technician.id)}><BadgeCheck size={16} /></button> : null}<button className="archive" title="أرشفة" type="button" onClick={() => void archive(technician.id)}><Archive size={16} /></button></div></td></tr>)}</tbody></table></div>}
      </section>

      {formOpen ? <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setFormOpen(false)}><form className="vehicle-form technician-form" onSubmit={save}><div className="form-header"><div><p>إدارة الفنيين</p><h2>{editingId ? 'تعديل ملف الفني' : 'إنشاء حساب فني جديد'}</h2></div><button className="icon-button" title="إغلاق" type="button" onClick={() => setFormOpen(false)}><X size={20} /></button></div><div className="form-grid">
        <label className="form-field"><span>الاسم الكامل *</span><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label className="form-field"><span>التخصص *</span><select value={form.specialty} onChange={(event) => setForm({ ...form, specialty: event.target.value })}>{specialties.map((specialty) => <option key={specialty}>{specialty}</option>)}</select></label>
        {!editingId ? <><label className="form-field"><span>رقم الهاتف الليبي *</span><input required dir="ltr" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="0912345678" /></label><label className="form-field"><span>كلمة مرور مؤقتة *</span><input required minLength={8} type="password" value={form.temporaryPassword} onChange={(event) => setForm({ ...form, temporaryPassword: event.target.value })} /></label></> : null}
        <label className="form-field"><span>المدينة *</span><select required value={form.cityId} onChange={(event) => setForm({ ...form, cityId: event.target.value })}><option value="">اختر المدينة</option>{cities.filter((city) => city.isActive).map((city) => <option value={city.id} key={city.id}>{city.nameAr}</option>)}</select></label>
        <label className="form-field"><span>سنوات الخبرة</span><input min="0" max="70" type="number" value={form.yearsExperience} onChange={(event) => setForm({ ...form, yearsExperience: event.target.value })} /></label>
        <label className="form-field"><span>السعر الأساسي LYD *</span><input required min="0" step="0.001" type="number" value={form.basePriceLyd} onChange={(event) => setForm({ ...form, basePriceLyd: event.target.value })} /></label>
        <label className="form-field"><span>حالة التوفر</span><select value={form.availabilityStatus} onChange={(event) => setForm({ ...form, availabilityStatus: event.target.value })}><option value="available">متاح</option><option value="busy">مشغول</option><option value="unavailable">غير متاح</option></select></label>
        <label className="form-field full-field"><span>مناطق الخدمة، مفصولة بفاصلة</span><input value={form.serviceRegions} onChange={(event) => setForm({ ...form, serviceRegions: event.target.value })} placeholder="البركة، الليثي، قاريونس" /></label>
      </div><div className="services-editor"><div className="services-title"><strong>الخدمات والأسعار</strong><button type="button" onClick={() => setForm({ ...form, services: [...form.services, { name: '', priceLyd: '', durationMinutes: 60 }] })}><Plus size={15} /> خدمة</button></div>{form.services.map((service, index) => <div className="service-input-row" key={index}><input required value={service.name} onChange={(event) => updateService(index, 'name', event.target.value)} placeholder="اسم الخدمة" /><input required min="0" type="number" value={service.priceLyd} onChange={(event) => updateService(index, 'priceLyd', event.target.value)} placeholder="السعر" /><input min="10" type="number" value={service.durationMinutes ?? ''} onChange={(event) => updateService(index, 'durationMinutes', event.target.value)} placeholder="الدقائق" /><button title="حذف الخدمة" type="button" onClick={() => setForm({ ...form, services: form.services.filter((_, serviceIndex) => serviceIndex !== index) })}><X size={16} /></button></div>)}</div><div className="form-note">لن يظهر رقم هاتف الفني للعامة. يُنشر الملف فقط بعد الضغط على زر الاعتماد والنشر.</div><div className="form-actions"><button className="secondary-button" type="button" onClick={() => setFormOpen(false)}>إلغاء</button><button className="primary-button" disabled={saving} type="submit">{saving ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />} حفظ</button></div></form></div> : null}
    </main>
  );
}
