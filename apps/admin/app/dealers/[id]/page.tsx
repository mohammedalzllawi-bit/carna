"use client";

import {
  ArrowRight,
  Building2,
  CarFront,
  CircleDollarSign,
  CreditCard,
  LoaderCircle,
  MessageSquareText,
  ShieldAlert,
  Star,
  Users,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CapabilityOverrides } from "../../components/capability-overrides";

type DealerDetail = {
  dealer: {
    id: string;
    name: string;
    phone: string | null;
    status: string;
    address: string | null;
    licenseNumber: string | null;
    ratingAverage: number;
    ratingCount: number;
    createdAt: string;
    owner: {
      id: string;
      fullName: string | null;
      phone: string | null;
      status: string;
      lastLoginAt: string | null;
    };
    city: { id: string; nameAr: string } | null;
    subscriptions: {
      id: string;
      status: string;
      startsAt: string | null;
      endsAt: string | null;
      plan: { name: string; priceLyd: number };
    }[];
  };
  stats: {
    vehicles: number;
    publishedVehicles: number;
    soldVehicles: number;
    soldValueLyd: number;
    staff: number;
  };
  vehicles: {
    id: string;
    lotNumber: string;
    make: string;
    model: string;
    year: number;
    saleType: string;
    approvalStatus: string;
    createdAt: string;
    auction: {
      id: string;
      status: string;
      currentBidLyd: number | null;
      finalAmountLyd: number | null;
    } | null;
  }[];
  staff: {
    id: string;
    title: string | null;
    status: string;
    user: {
      id: string;
      fullName: string | null;
      phone: string | null;
      status: string;
    };
  }[];
  reviews: {
    id: string;
    rating: number;
    comment: string | null;
    isHidden: boolean;
    createdAt: string;
    reviewer: { id: string; fullName: string | null; phone: string | null };
  }[];
  orders: {
    id: string;
    type: string;
    status: string;
    totalLyd: number;
    createdAt: string;
  }[];
};
type Wallet = {
  summary: {
    balanceLyd: number;
    rechargeCount: number;
    rechargeTotalLyd: number;
    totalSpentLyd: number;
  };
};

async function request<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(body.message || "تعذر تحميل البيانات");
  return body;
}
const money = (value: number) =>
  `${value.toLocaleString("ar-LY", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} د.ل`;
const date = (value: string | null) =>
  value ? new Date(value).toLocaleString("ar-LY") : "-";

export default function DealerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<DealerDetail | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const detail = await request<DealerDetail>(
        `/api/admin/dealers/${encodeURIComponent(id)}`,
      );
      setData(detail);
      setWallet(
        await request<Wallet>(
          `/api/admin/wallet/users/${encodeURIComponent(detail.dealer.owner.id)}`,
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل المعرض");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  if (loading)
    return (
      <main className="management-page">
        <div className="loading-state">
          <LoaderCircle className="spin" /> جارٍ تحميل ملف المعرض...
        </div>
      </main>
    );
  if (!data || !wallet)
    return (
      <main className="management-page">
        <div className="notice error">
          <ShieldAlert size={18} />
          {error || "المعرض غير موجود"}
        </div>
      </main>
    );
  const { dealer, stats } = data;
  return (
    <main className="management-page detail-page">
      <header className="management-header">
        <div>
          <a href="/dealers">
            <ArrowRight size={17} /> المعارض
          </a>
          <h1>{dealer.name}</h1>
          <p>
            {dealer.city?.nameAr || "مدينة غير محددة"} ·{" "}
            {dealer.address || "لا يوجد عنوان"} · ترخيص:{" "}
            {dealer.licenseNumber || "غير مسجل"}
          </p>
        </div>
        <span className={`status-chip status-${dealer.status.toLowerCase()}`}>
          {dealer.status}
        </span>
      </header>
      {error && (
        <div className="notice error">
          <ShieldAlert size={18} />
          {error}
        </div>
      )}
      <section className="detail-metrics">
        <Metric
          icon={<CarFront />}
          label="السيارات"
          value={String(stats.vehicles)}
          hint={`${stats.publishedVehicles} منشورة`}
        />
        <Metric
          icon={<CircleDollarSign />}
          label="قيمة السيارات المباعة"
          value={money(stats.soldValueLyd)}
          hint={`${stats.soldVehicles} سيارة`}
        />
        <Metric icon={<Users />} label="الموظفون" value={String(stats.staff)} />
        <Metric
          icon={<Star />}
          label="التقييم"
          value={`${dealer.ratingAverage.toFixed(1)} / 5`}
          hint={`${dealer.ratingCount} تقييم`}
        />
        <Metric
          icon={<WalletCards />}
          label="رصيد حساب المعرض"
          value={money(wallet.summary.balanceLyd)}
        />
        <Metric
          icon={<CreditCard />}
          label="مرات التمويل"
          value={String(wallet.summary.rechargeCount)}
          hint={money(wallet.summary.rechargeTotalLyd)}
        />
      </section>
      <div className="detail-columns">
        <section className="panel detail-section">
          <div className="panel-header">
            <div>
              <p className="eyebrow">الحساب التجاري</p>
              <h2>بيانات المالك</h2>
            </div>
            <Building2 size={20} />
          </div>
          <dl className="detail-list">
            <div>
              <dt>المالك</dt>
              <dd>
                <a href={`/users/${dealer.owner.id}`}>
                  {dealer.owner.fullName || "دون اسم"}
                </a>
              </dd>
            </div>
            <div>
              <dt>الهاتف</dt>
              <dd dir="ltr">{dealer.owner.phone}</dd>
            </div>
            <div>
              <dt>حالة الحساب</dt>
              <dd>{dealer.owner.status}</dd>
            </div>
            <div>
              <dt>آخر دخول</dt>
              <dd>{date(dealer.owner.lastLoginAt)}</dd>
            </div>
            <div>
              <dt>إجمالي المصروف</dt>
              <dd>{money(wallet.summary.totalSpentLyd)}</dd>
            </div>
            <div>
              <dt>تاريخ إنشاء المعرض</dt>
              <dd>{date(dealer.createdAt)}</dd>
            </div>
          </dl>
          <a className="secondary-button" href={`/users/${dealer.owner.id}`}>
            إدارة المحفظة والحساب
          </a>
        </section>
        <section className="panel detail-section">
          <div className="panel-header">
            <div>
              <p className="eyebrow">السجل الكامل</p>
              <h2>الاشتراكات</h2>
            </div>
            <CreditCard size={20} />
          </div>
          <div className="detail-stack">
            {dealer.subscriptions.map((item) => (
              <div key={item.id}>
                <strong>{item.plan.name}</strong>
                <span>{item.status}</span>
                <small>
                  {date(item.startsAt)} إلى {date(item.endsAt)} ·{" "}
                  {money(item.plan.priceLyd)}
                </small>
              </div>
            ))}
            {!dealer.subscriptions.length && (
              <p className="detail-empty">لا توجد اشتراكات.</p>
            )}
          </div>
        </section>
      </div>
    <CapabilityOverrides subjectType="Dealer" subjectId={dealer.id} />
    <Table
        title="السيارات والمزادات"
        headers={["السيارة", "رقم القطعة", "نوع البيع", "المراجعة", "المزاد"]}
        rows={data.vehicles.map((item) => [
          `${item.make} ${item.model} ${item.year}`,
          item.lotNumber,
          item.saleType,
          item.approvalStatus,
          item.auction
            ? `${item.auction.status}${item.auction.finalAmountLyd !== null ? ` · ${money(item.auction.finalAmountLyd)}` : ""}`
            : "لا يوجد",
        ])}
      />
      <Table
        title="التقييمات والتعليقات"
        headers={["المستخدم", "التقييم", "التعليق", "الحالة", "التاريخ"]}
        rows={data.reviews.map((item) => [
          item.reviewer.fullName || item.reviewer.phone || "مستخدم",
          `${item.rating}/5`,
          item.comment || "دون تعليق",
          item.isHidden ? "مخفي" : "ظاهر",
          date(item.createdAt),
        ])}
        icon={<MessageSquareText size={20} />}
      />
      <Table
        title="طلبات الاشتراك والدفع"
        headers={["النوع", "الحالة", "القيمة", "التاريخ"]}
        rows={data.orders.map((item) => [
          item.type,
          item.status,
          money(item.totalLyd),
          date(item.createdAt),
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
function Table({
  title,
  headers,
  rows,
  icon,
}: {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  icon?: React.ReactNode;
}) {
  return (
    <section className="panel detail-table">
      <div className="panel-header">
        <div>
          <p className="eyebrow">تفاصيل المعرض</p>
          <h2>{title}</h2>
        </div>
        {icon}
      </div>
      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {headers.map((item) => (
                  <th key={item}>{item}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {row.map((cell, position) => (
                    <td key={position}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="detail-empty">لا توجد بيانات.</p>
      )}
    </section>
  );
}
