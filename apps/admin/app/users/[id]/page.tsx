"use client";

import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Gavel,
  History,
  LoaderCircle,
  Save,
  ShieldAlert,
  UserRound,
  WalletCards,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CapabilityOverrides } from "../../components/capability-overrides";

type Vehicle = {
  id: string;
  lotNumber: string;
  make: string;
  model: string;
  year: number;
};
type UserDetail = {
  id: string;
  phone: string;
  fullName: string | null;
  email: string | null;
  status: string;
  phoneVerified: boolean;
  roles: string[];
  createdAt: string;
  lastLoginAt: string | null;
  activity: {
    bids: number;
    payments: number;
    inspectionRequests: number;
    disputes: number;
  };
  relatedProfile: {
    dealer: { id: string; name: string; status: string } | null;
    technician: { id: string; name: string; specialty: string } | null;
  };
  orders: {
    id: string;
    type: string;
    status: string;
    totalLyd: number;
    currency: string;
    createdAt: string;
  }[];
  bids: {
    id: string;
    auctionId: string;
    amountLyd: number;
    status: string;
    auctionStatus: string;
    createdAt: string;
    vehicle: Vehicle;
  }[];
  wins: {
    id: string;
    finalAmountLyd: number | null;
    depositAmountLyd: number;
    status: string;
    createdAt: string;
    vehicle: Vehicle;
  }[];
  inspections: {
    id: string;
    status: string;
    inspectionType: string;
    priceLyd: number;
    createdAt: string;
    technician: { id: string; name: string } | null;
    vehicle: Vehicle;
  }[];
  disputes: {
    id: string;
    caseNumber: string;
    reason: string;
    status: string;
    amountLyd: number | null;
    createdAt: string;
  }[];
};
type WalletDetail = {
  summary: {
    balanceLyd: number;
    totalCreditsLyd: number;
    creditCount: number;
    totalSpentLyd: number;
    debitCount: number;
    rechargeTotalLyd: number;
    rechargeCount: number;
    adminCreditLyd: number;
    adminCreditCount: number;
    adminDebitLyd: number;
    adminDebitCount: number;
  };
  entries: {
    id: string;
    amountLyd: number;
    direction: string;
    currency: string;
    type: string;
    description: string | null;
    createdAt: string;
  }[];
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = (await response.json()) as T & { message?: string | string[] };
  if (!response.ok)
    throw new Error(
      Array.isArray(body.message)
        ? body.message.join("، ")
        : body.message || "تعذر تنفيذ العملية",
    );
  return body;
}
const money = (value: number) =>
  `${value.toLocaleString("ar-LY", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} د.ل`;
const date = (value: string | null) =>
  value ? new Date(value).toLocaleString("ar-LY") : "لا يوجد";

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [wallet, setWallet] = useState<WalletDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [profile, walletData] = await Promise.all([
        request<UserDetail>(`/api/admin/users/${encodeURIComponent(id)}`),
        request<WalletDetail>(
          `/api/admin/wallet/users/${encodeURIComponent(id)}`,
        ),
      ]);
      setUser(profile);
      setWallet(walletData);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "تعذر تحميل التفاصيل",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function adjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      const updated = await request<WalletDetail>(
        `/api/admin/wallet/users/${encodeURIComponent(id)}/adjustments`,
        {
          method: "POST",
          body: JSON.stringify({
            direction: values.direction,
            amountLyd: Number(values.amountLyd),
            reason: values.reason,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      setWallet(updated);
      setMessage("تم تسجيل التسوية في السجل المالي وإشعار المستخدم.");
      form.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تعديل المحفظة");
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <main className="management-page">
        <div className="loading-state">
          <LoaderCircle className="spin" /> جارٍ تحميل ملف المستخدم...
        </div>
      </main>
    );
  if (!user || !wallet)
    return (
      <main className="management-page">
        <div className="notice error">
          <ShieldAlert size={18} />
          {error || "المستخدم غير موجود"}
        </div>
      </main>
    );
  const summary = wallet.summary;
  return (
    <main className="management-page detail-page">
      <header className="management-header">
        <div>
          <a href="/users">
            <ArrowRight size={17} /> المستخدمون
          </a>
          <h1>{user.fullName || "مستخدم دون اسم"}</h1>
          <p>
            <span dir="ltr">{user.phone}</span> · {user.roles.join("، ")} ·{" "}
            {user.status}
          </p>
        </div>
        <span className={`status-chip status-${user.status.toLowerCase()}`}>
          {user.phoneVerified ? "هاتف موثق" : "هاتف غير موثق"}
        </span>
      </header>
      {message && (
        <div className="notice success">
          <CheckCircle2 size={18} />
          {message}
        </div>
      )}
      {error && (
        <div className="notice error">
          <ShieldAlert size={18} />
          {error}
        </div>
      )}
      <section className="detail-metrics">
        <Metric
          icon={<WalletCards />}
          label="الرصيد الحالي"
          value={money(summary.balanceLyd)}
        />
        <Metric
          icon={<CreditCard />}
          label="مرات التمويل"
          value={summary.rechargeCount.toLocaleString("ar-LY")}
          hint={money(summary.rechargeTotalLyd)}
        />
        <Metric
          icon={<CircleDollarSign />}
          label="إجمالي المصروف"
          value={money(summary.totalSpentLyd)}
          hint={`${summary.debitCount} حركة خصم`}
        />
        <Metric
          icon={<Banknote />}
          label="إجمالي الإضافات"
          value={money(summary.totalCreditsLyd)}
          hint={`${summary.creditCount} حركة إضافة`}
        />
        <Metric
          icon={<Gavel />}
          label="المزايدات"
          value={user.activity.bids.toLocaleString("ar-LY")}
          hint={`${user.wins.length} فوز`}
        />
        <Metric
          icon={<History />}
          label="طلبات الفحص"
          value={user.activity.inspectionRequests.toLocaleString("ar-LY")}
        />
      </section>
      <div className="detail-columns">
        <section className="panel detail-section">
          <div className="panel-header">
            <div>
              <p className="eyebrow">بيانات الحساب</p>
              <h2>الملف والنشاط</h2>
            </div>
            <UserRound size={20} />
          </div>
          <dl className="detail-list">
            <div>
              <dt>تاريخ التسجيل</dt>
              <dd>{date(user.createdAt)}</dd>
            </div>
            <div>
              <dt>آخر دخول</dt>
              <dd>{date(user.lastLoginAt)}</dd>
            </div>
            <div>
              <dt>البريد</dt>
              <dd>{user.email || "غير مسجل"}</dd>
            </div>
            <div>
              <dt>المدفوعات</dt>
              <dd>{user.activity.payments}</dd>
            </div>
            <div>
              <dt>النزاعات</dt>
              <dd>{user.activity.disputes}</dd>
            </div>
            <div>
              <dt>الملف المرتبط</dt>
              <dd>
                {user.relatedProfile.dealer ? (
                  <a href={`/dealers/${user.relatedProfile.dealer.id}`}>
                    {user.relatedProfile.dealer.name}
                  </a>
                ) : user.relatedProfile.technician ? (
                  <a href={`/technicians/${user.relatedProfile.technician.id}`}>
                    {user.relatedProfile.technician.name}
                  </a>
                ) : (
                  "مستخدم عادي"
                )}
              </dd>
            </div>
          </dl>
        </section>
        <form className="panel wallet-adjustment" onSubmit={adjust}>
          <div className="panel-header">
            <div>
              <p className="eyebrow">قيد محاسبي غير قابل للحذف</p>
              <h2>إدارة المحفظة</h2>
            </div>
            <WalletCards size={20} />
          </div>
          <label className="form-field">
            <span>نوع العملية</span>
            <select name="direction" required defaultValue="Credit">
              <option value="Credit">إضافة رصيد</option>
              <option value="Debit">خصم رصيد</option>
            </select>
          </label>
          <label className="form-field">
            <span>القيمة بالدينار الليبي</span>
            <input
              name="amountLyd"
              required
              type="number"
              min="0.001"
              step="0.001"
            />
          </label>
          <label className="form-field">
            <span>سبب التسوية</span>
            <textarea
              name="reason"
              required
              minLength={5}
              maxLength={500}
              rows={3}
            />
          </label>
          <p className="table-note">
            لا يتم تعديل الرصيد مباشرة. تُنشأ حركة Ledger ويسجل اسم المدير
            والرصيد قبل وبعد العملية.
          </p>
          <button className="primary-button" disabled={saving}>
            {saving ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Save size={17} />
            )}{" "}
            تسجيل التسوية
          </button>
        </form>
      </div>
    <CapabilityOverrides subjectType="User" subjectId={user.id} />
    <DetailTable
        title="حركات المحفظة"
        empty="لا توجد حركات مالية"
        headers={["النوع", "الاتجاه", "القيمة", "السبب", "التاريخ"]}
        rows={wallet.entries.map((entry) => [
          entry.type,
          entry.direction === "Credit" ? "إضافة" : "خصم",
          money(entry.amountLyd),
          entry.description || "-",
          date(entry.createdAt),
        ])}
      />
      <DetailTable
        title="الطلبات والمدفوعات"
        empty="لا توجد طلبات"
        headers={["الطلب", "الحالة", "الإجمالي", "التاريخ"]}
        rows={user.orders.map((order) => [
          order.type,
          order.status,
          money(order.totalLyd),
          date(order.createdAt),
        ])}
      />
      <DetailTable
        title="آخر المزايدات"
        empty="لا توجد مزايدات"
        headers={[
          "السيارة",
          "المبلغ",
          "حالة المزايدة",
          "حالة المزاد",
          "التاريخ",
        ]}
        rows={user.bids.map((bid) => [
          `${bid.vehicle.make} ${bid.vehicle.model} ${bid.vehicle.year}`,
          money(bid.amountLyd),
          bid.status,
          bid.auctionStatus,
          date(bid.createdAt),
        ])}
      />
      <DetailTable
        title="طلبات الفحص"
        empty="لا توجد طلبات فحص"
        headers={["السيارة", "الفني", "النوع", "الحالة", "القيمة"]}
        rows={user.inspections.map((item) => [
          `${item.vehicle.make} ${item.vehicle.model} ${item.vehicle.year}`,
          item.technician?.name || "غير محدد",
          item.inspectionType,
          item.status,
          money(item.priceLyd),
        ])}
      />
    </main>
  );
}

function Metric({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <article>
      {icon}
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {hint && <small>{hint}</small>}
      </div>
    </article>
  );
}
function DetailTable({
  title,
  empty,
  headers,
  rows,
}: {
  title: string;
  empty: string;
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <section className="panel detail-table">
      <div className="panel-header">
        <div>
          <p className="eyebrow">آخر 100 سجل كحد أقصى</p>
          <h2>{title}</h2>
        </div>
      </div>
      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {headers.map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="detail-empty">{empty}</p>
      )}
    </section>
  );
}
