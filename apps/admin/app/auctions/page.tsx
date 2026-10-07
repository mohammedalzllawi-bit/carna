"use client";

import {
  ArrowRight,
  Gavel,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

type Auction = {
  id: string;
  description: string | null;
  status: string;
  currentBidLyd: number;
  bidCount: number;
  startsAt: string;
  endsAt: string;
  vehicle: { make: string; model: string; year: number; lotNumber: string; category: string; condition: string; mileageKm: number | null };
};
type Vehicle = {
  id: string;
  make: string;
  model: string;
  year: number;
  approvalStatus: string;
};
const labels: Record<string, string> = {
  Scheduled: "مجدول",
  Live: "مباشر",
  Paused: "متوقف",
  Cancelled: "ملغى",
  PaymentPending: "بانتظار العربون",
  Sold: "مباع",
  NoWinner: "بدون فائز",
  Relisted: "أعيد إدراجه",
};

export default function AuctionsAdminPage() {
  const [items, setItems] = useState<Auction[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [open, setOpen] = useState(false);
  const [rollingRound, setRollingRound] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    const responses = await Promise.all([
      fetch("/api/admin/auctions"),
      fetch("/api/admin/vehicles"),
    ]);
    if (responses.some((r) => r.status === 401)) {
      location.href = "/login";
      return;
    }
    if (responses.some((r) => !r.ok))
      throw new Error("تعذر تحميل المزادات. تحقق من صلاحية الحساب.");
    setItems(await responses[0].json());
    setVehicles(await responses[1].json());
  }
  useEffect(() => {
    void load().catch((e: Error) => setError(e.message));
    const timer = setInterval(() => void load().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = Object.fromEntries(
      new FormData(event.currentTarget),
    ) as Record<string, string>;
    try {
      const response = await fetch("/api/admin/auctions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          startsAt: new Date(form.startsAt).toISOString(),
          rollingRound,
          endsAt: rollingRound ? undefined : new Date(form.endsAt).toISOString(),
          reservePriceLyd: form.reservePriceLyd || undefined,
          bidIncrementLyd: form.bidIncrementLyd || undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "تعذر إنشاء المزاد");
      setOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الحفظ");
    } finally {
      setBusy(false);
    }
  }
  async function status(item: Auction, value: string) {
    if (
      value === "Cancelled" &&
      !confirm("إلغاء المزاد مع الاحتفاظ بسجل المزايدات؟")
    )
      return;
    try {
      const response = await fetch(`/api/admin/auctions/${item.id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: value }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر التحديث");
    }
  }
  return (
    <main className="management-page">
      <header className="management-header">
        <div>
          <a href="/">
            <ArrowRight size={17} /> لوحة الإدارة
          </a>
          <h1>المزادات</h1>
        </div>
        <div className="row-actions">
          <button title="تحديث" onClick={() => void load()}>
            <RefreshCw size={18} />
          </button>
          <button title="إنشاء مزاد" onClick={() => setOpen(true)}>
            <Plus size={18} />
          </button>
        </div>
      </header>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>السيارة</th>
              <th>الحالة</th>
              <th>السعر الحالي</th>
              <th>المزايدات</th>
              <th>النهاية</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>
                    {item.vehicle.make} {item.vehicle.model} {item.vehicle.year}
                  </strong>
                  <small>{item.vehicle.lotNumber}</small>
                  {item.description && <small className="auction-description-preview">{item.description}</small>}
                </td>
                <td>{labels[item.status] ?? item.status}</td>
                <td>{item.currentBidLyd.toLocaleString("ar-LY")} د.ل</td>
                <td>{item.bidCount}</td>
                <td>{new Date(item.endsAt).toLocaleString("ar-LY")}</td>
                <td>
                  <div className="row-actions">
                    {["Scheduled", "Paused"].includes(item.status) && (
                      <button
                        title="تشغيل"
                        onClick={() => void status(item, "Live")}
                      >
                        <Play size={16} />
                      </button>
                    )}
                    {item.status === "Live" && (
                      <button
                        title="إيقاف مؤقت"
                        onClick={() => void status(item, "Paused")}
                      >
                        <Pause size={16} />
                      </button>
                    )}
                    {["Scheduled", "Live", "Paused"].includes(item.status) && (
                      <button
                        title="إلغاء"
                        onClick={() => void status(item, "Cancelled")}
                      >
                        <X size={16} />
                      </button>
                    )}
                    <a
                      href={`${process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3100'}/auctions/${item.id}`}
                      title="عرض المزاد"
                    >
                      <Gavel size={17} />
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && (
          <div className="empty-state">
            <Gavel size={34} />
            <h3>لا توجد مزادات</h3>
          </div>
        )}
      </div>
      {open && (
        <div className="modal-backdrop">
          <form className="vehicle-form" onSubmit={save}>
            <div className="form-header">
              <h2>إنشاء مزاد</h2>
              <button
                className="icon-button"
                type="button"
                title="إغلاق"
                onClick={() => setOpen(false)}
              >
                <X />
              </button>
            </div>
            <div className="form-grid">
              <label className="form-field full-field">
                <span>السيارة المنشورة</span>
                <select required name="vehicleId">
                  <option value="">اختر السيارة</option>
                  {vehicles
                    .filter((v) => v.approvalStatus === "Published")
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.make} {v.model} {v.year}
                      </option>
                    ))}
                </select>
              </label>
              <label className="form-field full-field"><span>نوع المزاد</span><select value={rollingRound ? 'rolling' : 'scheduled'} onChange={(event) => setRollingRound(event.target.value === 'rolling')}><option value="rolling">جولة سريعة · المدة من الإعدادات وتتجدد بعد كل مزايدة</option><option value="scheduled">موعد نهاية ثابت مع تمديد آخر اللحظات</option></select></label>
              <label className="form-field">
                <span>البداية (توقيت جهازك)</span>
                <input required type="datetime-local" name="startsAt" />
              </label>
              {!rollingRound && <label className="form-field">
                <span>النهاية (توقيت جهازك)</span>
                <input required type="datetime-local" name="endsAt" />
              </label>}
              <label className="form-field">
                <span>السعر الابتدائي د.ل</span>
                <input
                  required
                  type="number"
                  step="0.001"
                  min="0.001"
                  name="startingPriceLyd"
                />
              </label>
              <label className="form-field">
                <span>الزيادة الدنيا د.ل</span>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    name="bidIncrementLyd"
                    placeholder="إعداد الزيادة الافتراضي"
                />
              </label>
              <label className="form-field">
                <span>السعر الاحتياطي د.ل</span>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  name="reservePriceLyd"
                />
              </label>
              <label className="form-field full-field">
                <span>وصف المزاد</span>
                <textarea name="description" maxLength={2000} rows={4} placeholder="حالة المركبة، الملاحظات المهمة، وشروط الاستلام" />
              </label>
            </div>
            <button className="primary-button" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <Plus size={18} />
              )}{" "}
              إنشاء المزاد
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
