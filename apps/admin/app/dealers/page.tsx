"use client";

import {
  ArrowRight,
  BadgeCheck,
  BellRing,
  Building2,
  CheckCircle2,
  CreditCard,
  Edit3,
  Eye,
  EyeOff,
  Gavel,
  LoaderCircle,
  MessageSquareText,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Tab = "dealers" | "plans" | "reviews" | "listings";
type Plan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  audience: "Dealer" | "Customer" | "Both";
  permissions: string[];
  priceLyd: number;
  durationDays: number;
  vehicleLimit: number | null;
  auctionLimit: number | null;
  auctionVehicleLimit: number | null;
  staffLimit: number | null;
  searchBoostEnabled: boolean;
  adsIncluded: boolean;
  extraVehicleFeeLyd: number | null;
  commissionRate: number | null;
  billingModel: string;
  isActive: boolean;
};
type Capability = {
  id: string | null;
  code: string;
  name: string;
  label: string;
  description: string | null;
  isActive: boolean;
};
type PlanForm = Omit<
  Plan,
  | "id"
  | "description"
  | "priceLyd"
  | "durationDays"
  | "vehicleLimit"
  | "auctionLimit"
  | "auctionVehicleLimit"
  | "staffLimit"
  | "extraVehicleFeeLyd"
  | "commissionRate"
> & {
  description: string;
  priceLyd: string;
  durationDays: string;
  vehicleLimit: string;
  auctionLimit: string;
  auctionVehicleLimit: string;
  staffLimit: string;
  extraVehicleFeeLyd: string;
  commissionRate: string;
};
type Subscription = {
  id: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  plan: Plan;
};
type Dealer = {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  city: { id: string; nameAr: string } | null;
  owner: {
    fullName: string | null;
    phone: string | null;
    lastLoginAt: string | null;
  };
  counts: { vehicles: number; staff: number; reviews: number };
  ratingAverage: number;
  currentSubscription: Subscription | null;
  createdAt: string;
};
type Review = {
  id: string;
  rating: number;
  comment: string | null;
  isHidden: boolean;
  moderationReason: string | null;
  createdAt: string;
  dealer: { id: string; name: string } | null;
  reviewer: { fullName: string | null; phone: string | null };
};
type Listing = {
  id: string;
  status: string;
  totalLyd: number;
  createdAt: string;
  user: { fullName: string | null; phone: string | null };
  vehicle: {
    lotNumber: string;
    make: string;
    model: string;
    year: number;
    city: string | null;
    approvalStatus: string;
    auctionId: string | null;
  } | null;
};
type City = { id: string; nameAr: string };

const emptyPlan: PlanForm = {
  code: "",
  name: "",
  description: "",
  audience: "Dealer",
  permissions: [],
  priceLyd: "",
  durationDays: "30",
  vehicleLimit: "",
  auctionLimit: "",
  auctionVehicleLimit: "",
  staffLimit: "",
  searchBoostEnabled: false,
  adsIncluded: false,
  extraVehicleFeeLyd: "",
  commissionRate: "",
  billingModel: "Subscription",
  isActive: true,
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
    cache: "no-store",
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

export default function DealersAdminPage() {
  const [tab, setTab] = useState<Tab>("dealers");
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [capabilityForm, setCapabilityForm] = useState({
    code: "",
    name: "",
    description: "",
  });
  const [selectedPlans, setSelectedPlans] = useState<Record<string, string>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dealerFormOpen, setDealerFormOpen] = useState(false);
  const [planFormOpen, setPlanFormOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState<PlanForm>(emptyPlan);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [
        dealerData,
        planData,
        reviewData,
        listingData,
        cityData,
        capabilityData,
      ] = await Promise.all([
        request<Dealer[]>("/api/admin/dealers"),
        request<Plan[]>("/api/admin/dealers/plans"),
        request<Review[]>("/api/admin/dealers/reviews"),
        request<Listing[]>("/api/admin/auction-listings"),
        request<City[]>("/api/admin/cities"),
        request<Capability[]>("/api/admin/dealers/plan-capabilities"),
      ]);
      setDealers(dealerData);
      setPlans(planData);
      setReviews(reviewData);
      setListings(listingData);
      setCities(cityData);
      setCapabilities(capabilityData);
      setSelectedPlans(
        Object.fromEntries(
          dealerData.map((dealer) => [
            dealer.id,
            dealer.currentSubscription?.plan.id ?? planData[0]?.id ?? "",
          ]),
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "تعذر تحميل بيانات المعارض",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const stats = useMemo(
    () => ({
      verified: dealers.filter((item) => item.status === "Verified").length,
      subscribed: dealers.filter((item) => item.currentSubscription).length,
      pendingReviews: reviews.filter((item) => !item.isHidden).length,
      paidListings: listings.filter(
        (item) =>
          item.status === "Paid" &&
          item.vehicle?.approvalStatus === "PendingReview",
      ).length,
    }),
    [dealers, reviews, listings],
  );

  async function createDealer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("create-dealer");
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const payload = {
      ...values,
      cityId: values.cityId || undefined,
      planId: values.planId || undefined,
      activateSubscription: values.activateSubscription === "on",
      status: values.status || "Verified",
    };
    try {
      await request("/api/admin/dealers", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setDealerFormOpen(false);
      setMessage(
        "تم إنشاء حساب المعرض ويمكن للمالك الدخول برقم الهاتف وكلمة السر.",
      );
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إنشاء المعرض");
    } finally {
      setBusy("");
    }
  }

  function openPlan(plan?: Plan) {
    setEditingPlanId(plan?.id ?? null);
    setPlanForm(
      plan
        ? {
            code: plan.code,
            name: plan.name,
            description: plan.description ?? "",
            audience: plan.audience,
            permissions: plan.permissions,
            priceLyd: String(plan.priceLyd),
            durationDays: String(plan.durationDays),
            vehicleLimit: plan.vehicleLimit?.toString() ?? "",
            auctionLimit: plan.auctionLimit?.toString() ?? "",
            auctionVehicleLimit: plan.auctionVehicleLimit?.toString() ?? "",
            staffLimit: plan.staffLimit?.toString() ?? "",
            searchBoostEnabled: plan.searchBoostEnabled,
            adsIncluded: plan.adsIncluded,
            extraVehicleFeeLyd: plan.extraVehicleFeeLyd?.toString() ?? "",
            commissionRate: plan.commissionRate?.toString() ?? "",
            billingModel: plan.billingModel,
            isActive: plan.isActive,
          }
        : emptyPlan,
    );
    setPlanFormOpen(true);
  }

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("plan");
    setError("");
    const payload = {
      ...planForm,
      durationDays: Number(planForm.durationDays),
      vehicleLimit: planForm.vehicleLimit
        ? Number(planForm.vehicleLimit)
        : undefined,
      auctionLimit: planForm.auctionLimit
        ? Number(planForm.auctionLimit)
        : undefined,
      auctionVehicleLimit: planForm.auctionVehicleLimit
        ? Number(planForm.auctionVehicleLimit)
        : undefined,
      staffLimit: planForm.staffLimit ? Number(planForm.staffLimit) : undefined,
      extraVehicleFeeLyd: planForm.extraVehicleFeeLyd || undefined,
      commissionRate: planForm.commissionRate
        ? Number(planForm.commissionRate)
        : undefined,
    };
    try {
      await request(
        editingPlanId
          ? `/api/admin/dealers/plans/${editingPlanId}`
          : "/api/admin/dealers/plans",
        {
          method: editingPlanId ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      setPlanFormOpen(false);
      setMessage("تم حفظ خطة الاشتراك.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ الخطة");
    } finally {
      setBusy("");
    }
  }

  async function createCapability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("capability");
    setError("");
    try {
      await request("/api/admin/dealers/plan-capabilities", {
        method: "POST",
        body: JSON.stringify({ ...capabilityForm, isActive: true }),
      });
      setCapabilityForm({ code: "", name: "", description: "" });
      setMessage("تمت إضافة الصلاحية الجديدة.");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "تعذر إضافة الصلاحية",
      );
    } finally {
      setBusy("");
    }
  }

  async function toggleCapability(capability: Capability) {
    setBusy(`capability:${capability.code}`);
    setError("");
    try {
      await request(
        `/api/admin/dealers/plan-capabilities/${encodeURIComponent(capability.code)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            code: capability.code,
            name: capability.name || capability.label,
            description: capability.description || undefined,
            isActive: !capability.isActive,
          }),
        },
      );
      setMessage(
        capability.isActive
          ? "تم إيقاف الصلاحية على مستوى النظام."
          : "تم تفعيل الصلاحية.",
      );
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "تعذر تعديل الصلاحية",
      );
    } finally {
      setBusy("");
    }
  }

  async function archivePlan(plan: Plan) {
    setBusy(`archive:${plan.id}`);
    setError("");
    try {
      await request(`/api/admin/dealers/plans/${plan.id}`, {
        method: "DELETE",
      });
      setMessage("تمت أرشفة الباقة مع الاحتفاظ بالاشتراكات القديمة.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر أرشفة الباقة");
    } finally {
      setBusy("");
    }
  }

  async function setStatus(dealerId: string, status: string) {
    setBusy(dealerId);
    setError("");
    try {
      await request(`/api/admin/dealers/${dealerId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setMessage("تم تحديث حالة المعرض.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحديث الحالة");
    } finally {
      setBusy("");
    }
  }

  async function subscription(dealerId: string, action: string) {
    const payload = {
      action,
      ...(action === "extend" ? { days: 30 } : {}),
      ...(["activate", "change"].includes(action)
        ? { planId: selectedPlans[dealerId] }
        : {}),
    };
    setBusy(`${dealerId}-${action}`);
    setError("");
    try {
      await request(`/api/admin/dealers/${dealerId}/subscriptions`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setMessage(
        action === "remind"
          ? "تم إرسال التذكير."
          : "تم تحديث الاشتراك وتسجيل الإجراء.",
      );
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "تعذر تحديث الاشتراك",
      );
    } finally {
      setBusy("");
    }
  }

  async function moderate(review: Review) {
    setBusy(review.id);
    setError("");
    try {
      await request(`/api/admin/dealers/reviews/${review.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          hidden: !review.isHidden,
          reason: !review.isHidden ? "مخالفة سياسة التعليقات" : undefined,
        }),
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحديث التعليق");
    } finally {
      setBusy("");
    }
  }

  async function listingAction(listing: Listing, action: "approve" | "reject") {
    const reason =
      action === "reject"
        ? window.prompt("اكتب سبب الرفض الذي سيظهر للمستخدم:")
        : "";
    if (action === "reject" && !reason) return;
    setBusy(listing.id);
    setError("");
    try {
      await request(`/api/admin/auction-listings/${listing.id}/${action}`, {
        method: "POST",
        body: JSON.stringify(action === "reject" ? { reason } : {}),
      });
      setMessage(
        action === "approve"
          ? "تم اعتماد الطلب وإنشاء المزاد."
          : "تم رفض الطلب وإشعار المستخدم.",
      );
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر معالجة الطلب");
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="management-page">
      <header className="management-header">
        <div>
          <a href="/">
            <ArrowRight size={17} /> لوحة الإدارة
          </a>
          <h1>المعارض والاشتراكات</h1>
          <p>حسابات المعارض، الخطط، التقييمات، وطلبات المزاد المدفوعة</p>
        </div>
        <div className="row-actions">
          <button title="تحديث" onClick={() => void load()}>
            <RefreshCw size={18} />
          </button>
          <button title="إضافة معرض" onClick={() => setDealerFormOpen(true)}>
            <Plus size={18} />
          </button>
        </div>
      </header>
      <section className="mini-stats">
        <div>
          <strong>{dealers.length}</strong>
          <span>كل المعارض</span>
        </div>
        <div>
          <strong>{stats.verified}</strong>
          <span>معرض موثق</span>
        </div>
        <div>
          <strong>{stats.subscribed}</strong>
          <span>اشتراك نشط</span>
        </div>
        <div>
          <strong>{stats.paidListings}</strong>
          <span>طلبات مزاد للمراجعة</span>
        </div>
      </section>
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
      <div className="admin-tabs" role="tablist">
        <button
          className={tab === "dealers" ? "active" : ""}
          onClick={() => setTab("dealers")}
        >
          <Building2 size={17} /> المعارض
        </button>
        <button
          className={tab === "plans" ? "active" : ""}
          onClick={() => setTab("plans")}
        >
          <CreditCard size={17} /> الخطط
        </button>
        <button
          className={tab === "reviews" ? "active" : ""}
          onClick={() => setTab("reviews")}
        >
          <MessageSquareText size={17} /> التعليقات
        </button>
        <button
          className={tab === "listings" ? "active" : ""}
          onClick={() => setTab("listings")}
        >
          <Gavel size={17} /> طلبات المزاد
        </button>
      </div>
      {loading ? (
        <div className="loading-state">
          <LoaderCircle className="spin" size={24} /> جارٍ تحميل البيانات...
        </div>
      ) : null}

      {!loading && tab === "dealers" && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">{dealers.length} حساب</p>
              <h2>إدارة المعارض</h2>
            </div>
            <button
              className="primary-button"
              onClick={() => setDealerFormOpen(true)}
            >
              <Plus size={17} /> إضافة معرض
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>المعرض والمالك</th>
                  <th>الحالة</th>
                  <th>النشاط</th>
                  <th>الاشتراك الحالي</th>
                  <th>إدارة الاشتراك</th>
                </tr>
              </thead>
              <tbody>
                {dealers.map((dealer) => (
                  <tr key={dealer.id}>
                    <td>
                      <strong>
                        <a href={`/dealers/${dealer.id}`}>{dealer.name}</a>
                      </strong>
                      <small>
                        {dealer.owner.fullName} ·{" "}
                        <span dir="ltr">{dealer.owner.phone}</span>
                      </small>
                    </td>
                    <td>
                      <select
                        value={dealer.status}
                        disabled={busy === dealer.id}
                        onChange={(event) =>
                          void setStatus(dealer.id, event.target.value)
                        }
                      >
                        <option value="Verified">موثق</option>
                        <option value="PendingReview">بانتظار المراجعة</option>
                        <option value="Suspended">موقوف</option>
                        <option value="Frozen">مجمّد</option>
                        <option value="Rejected">مرفوض</option>
                      </select>
                    </td>
                    <td>
                      <strong>{dealer.counts.vehicles} سيارة</strong>
                      <small>
                        {dealer.counts.reviews} تقييم ·{" "}
                        {dealer.ratingAverage.toFixed(1)}/5
                      </small>
                    </td>
                    <td>
                      {dealer.currentSubscription ? (
                        <>
                          <strong>
                            {dealer.currentSubscription.plan.name}
                          </strong>
                          <small>
                            حتى{" "}
                            {new Date(
                              dealer.currentSubscription.endsAt!,
                            ).toLocaleDateString("ar-LY")}
                          </small>
                        </>
                      ) : (
                        <span className="status-chip">دون اشتراك</span>
                      )}
                    </td>
                    <td>
                      <div className="subscription-control">
                        <a
                          className="icon-button"
                          title="عرض التفاصيل"
                          href={`/dealers/${dealer.id}`}
                        >
                          <Eye size={15} />
                        </a>
                        <select
                          value={selectedPlans[dealer.id] ?? ""}
                          onChange={(event) =>
                            setSelectedPlans({
                              ...selectedPlans,
                              [dealer.id]: event.target.value,
                            })
                          }
                        >
                          <option value="">اختر خطة</option>
                          {plans
                            .filter((plan) => plan.isActive)
                            .map((plan) => (
                              <option key={plan.id} value={plan.id}>
                                {plan.name}
                              </option>
                            ))}
                        </select>
                        <button
                          title={
                            dealer.currentSubscription
                              ? "تغيير الخطة"
                              : "تفعيل الخطة"
                          }
                          disabled={!selectedPlans[dealer.id] || Boolean(busy)}
                          onClick={() =>
                            void subscription(
                              dealer.id,
                              dealer.currentSubscription
                                ? "change"
                                : "activate",
                            )
                          }
                        >
                          <BadgeCheck size={15} />
                        </button>
                        <button
                          title="تمديد 30 يوماً"
                          disabled={
                            !dealer.currentSubscription || Boolean(busy)
                          }
                          onClick={() => void subscription(dealer.id, "extend")}
                        >
                          <CreditCard size={15} />
                        </button>
                        <button
                          title="إرسال تذكير"
                          disabled={Boolean(busy)}
                          onClick={() => void subscription(dealer.id, "remind")}
                        >
                          <BellRing size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!dealers.length && (
              <div className="empty-state">
                <Building2 size={34} />
                <h3>لا توجد معارض بعد</h3>
              </div>
            )}
          </div>
        </section>
      )}

      {!loading && tab === "plans" && (
        <section className="plans-management">
          <div className="panel capability-catalog">
            <div className="panel-header">
              <div>
                <p className="eyebrow">كتالوج مركزي قابل للتوسع</p>
                <h2>صلاحيات الباقات</h2>
              </div>
            </div>
            <form onSubmit={createCapability}>
              <label>
                <span>رمز الصلاحية</span>
                <input
                  required
                  dir="ltr"
                  pattern="CAN_[A-Z0-9_]+"
                  placeholder="CAN_EXPORT_REPORTS"
                  value={capabilityForm.code}
                  onChange={(event) =>
                    setCapabilityForm({
                      ...capabilityForm,
                      code: event.target.value.toUpperCase(),
                    })
                  }
                />
              </label>
              <label>
                <span>الاسم</span>
                <input
                  required
                  value={capabilityForm.name}
                  onChange={(event) =>
                    setCapabilityForm({
                      ...capabilityForm,
                      name: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                <span>الوصف</span>
                <input
                  value={capabilityForm.description}
                  onChange={(event) =>
                    setCapabilityForm({
                      ...capabilityForm,
                      description: event.target.value,
                    })
                  }
                />
              </label>
              <button
                className="primary-button"
                disabled={busy === "capability"}
              >
                <Plus size={16} /> إضافة
              </button>
            </form>
            <div className="capability-list">
              {capabilities.map((capability) => (
                <div key={capability.code}>
                  <span
                    className={
                      capability.isActive
                        ? "capability-dot active"
                        : "capability-dot"
                    }
                  />
                  <div>
                    <strong>{capability.name || capability.label}</strong>
                    <small dir="ltr">{capability.code}</small>
                  </div>
                  <button
                    className="icon-button"
                    title={
                      capability.isActive
                        ? "إيقاف الصلاحية عالميًا"
                        : "تفعيل الصلاحية"
                    }
                    disabled={busy === `capability:${capability.code}`}
                    onClick={() => void toggleCapability(capability)}
                  >
                    {capability.isActive ? (
                      <Eye size={16} />
                    ) : (
                      <EyeOff size={16} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="panel-header">
            <div>
              <p className="eyebrow">الأسعار والحدود والصلاحيات من مكان واحد</p>
              <h2>خطط الاشتراك</h2>
            </div>
            <button className="primary-button" onClick={() => openPlan()}>
              <Plus size={17} /> خطة جديدة
            </button>
          </div>
          <div className="dealer-plan-grid">
            {plans.map((plan) => (
              <article className="dealer-plan-card" key={plan.id}>
                <div className="plan-card-heading">
                  <span
                    className={
                      plan.isActive
                        ? "status-chip status-published"
                        : "status-chip"
                    }
                  >
                    {plan.isActive ? "متاحة" : "موقوفة"}
                  </span>
                  <span className="plan-audience">
                    {plan.audience === "Dealer"
                      ? "معرض"
                      : plan.audience === "Customer"
                        ? "مستخدم"
                        : "الجميع"}
                  </span>
                </div>
                <div>
                  <h3>{plan.name}</h3>
                  <strong>{plan.priceLyd.toLocaleString("ar-LY")} د.ل</strong>
                  <p>
                    {plan.description || `اشتراك لمدة ${plan.durationDays} يوم`}
                  </p>
                </div>
                <dl>
                  <div>
                    <dt>السيارات</dt>
                    <dd>{plan.vehicleLimit ?? "غير محدود"}</dd>
                  </div>
                  <div>
                    <dt>المزادات</dt>
                    <dd>{plan.auctionLimit ?? "غير محدود"}</dd>
                  </div>
                  <div>
                    <dt>سيارات الجلسة</dt>
                    <dd>{plan.auctionVehicleLimit ?? "غير محدود"}</dd>
                  </div>
                </dl>
                <div className="plan-permission-summary">
                  <ShieldAlert size={15} />
                  <span>{plan.permissions.length} صلاحية مفعلة</span>
                </div>
                <div className="plan-card-actions">
                  <button
                    className="secondary-button"
                    onClick={() => openPlan(plan)}
                  >
                    <Edit3 size={16} /> تعديل
                  </button>
                  {plan.isActive && (
                    <button
                      className="secondary-button danger-button"
                      disabled={busy === `archive:${plan.id}`}
                      onClick={() => void archivePlan(plan)}
                    >
                      <EyeOff size={16} /> أرشفة
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {!loading && tab === "reviews" && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">إخفاء دون حذف السجل</p>
              <h2>تعليقات وتقييمات المعارض</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>المعرض</th>
                  <th>المستخدم</th>
                  <th>التقييم</th>
                  <th>التعليق</th>
                  <th>الحالة</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((review) => (
                  <tr key={review.id}>
                    <td>
                      <strong>{review.dealer?.name}</strong>
                    </td>
                    <td>
                      {review.reviewer.fullName}
                      <small dir="ltr">{review.reviewer.phone}</small>
                    </td>
                    <td>{review.rating}/5</td>
                    <td className="review-comment">
                      {review.comment || "بدون تعليق"}
                    </td>
                    <td>
                      {review.isHidden ? (
                        <span className="status-chip">مخفي</span>
                      ) : (
                        <span className="status-chip status-published">
                          ظاهر
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        title={
                          review.isHidden ? "إظهار التعليق" : "إخفاء التعليق"
                        }
                        disabled={busy === review.id}
                        onClick={() => void moderate(review)}
                      >
                        {review.isHidden ? (
                          <Eye size={16} />
                        ) : (
                          <EyeOff size={16} />
                        )}
                      </button>
                    </td>
                  </tr>
                  ))}
              </tbody>
            </table>
            {!reviews.length && (
              <div className="empty-state">
                <MessageSquareText size={34} />
                <h3>لا توجد تقييمات</h3>
              </div>
            )}
          </div>
        </section>
      )}

      {!loading && tab === "listings" && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">الدفع ثم المراجعة</p>
              <h2>طلبات إدخال السيارات للمزاد</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>السيارة</th>
                  <th>المستخدم</th>
                  <th>الرسوم</th>
                  <th>الدفع</th>
                  <th>المراجعة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((listing) => (
                  <tr key={listing.id}>
                    <td>
                      <strong>
                        {listing.vehicle
                          ? `${listing.vehicle.make} ${listing.vehicle.model} ${listing.vehicle.year}`
                          : "سيارة غير متاحة"}
                      </strong>
                      <small>{listing.vehicle?.lotNumber}</small>
                    </td>
                    <td>
                      {listing.user.fullName}
                      <small dir="ltr">{listing.user.phone}</small>
                    </td>
                    <td>{listing.totalLyd.toLocaleString("ar-LY")} د.ل</td>
                    <td>{listing.status}</td>
                    <td>{listing.vehicle?.approvalStatus ?? "-"}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="publish"
                          title="اعتماد وإنشاء المزاد"
                          disabled={
                            listing.status !== "Paid" ||
                            listing.vehicle?.approvalStatus !==
                              "PendingReview" ||
                            Boolean(busy)
                          }
                          onClick={() => void listingAction(listing, "approve")}
                        >
                          <CheckCircle2 size={16} />
                        </button>
                        <button
                          className="archive"
                          title="رفض"
                          disabled={
                            Boolean(busy) || Boolean(listing.vehicle?.auctionId)
                          }
                          onClick={() => void listingAction(listing, "reject")}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!listings.length && (
              <div className="empty-state">
                <Gavel size={34} />
                <h3>لا توجد طلبات مزاد</h3>
              </div>
            )}
          </div>
        </section>
      )}

      {dealerFormOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setDealerFormOpen(false)
          }
        >
          <form className="vehicle-form" onSubmit={createDealer}>
            <div className="form-header">
              <div>
                <p>حساب تجاري</p>
                <h2>إضافة معرض ومالك الحساب</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                title="إغلاق"
                onClick={() => setDealerFormOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="form-grid">
              <label className="form-field">
                <span>اسم المعرض *</span>
                <input required name="name" maxLength={120} />
              </label>
              <label className="form-field">
                <span>اسم المالك *</span>
                <input required name="ownerName" maxLength={100} />
              </label>
              <label className="form-field">
                <span>رقم الهاتف الليبي *</span>
                <input
                  required
                  name="phone"
                  dir="ltr"
                  placeholder="0912345678"
                />
              </label>
              <label className="form-field">
                <span>كلمة السر *</span>
                <input
                  required
                  name="password"
                  type="password"
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                />
              </label>
              <label className="form-field">
                <span>المدينة</span>
                <select name="cityId">
                  <option value="">غير محددة</option>
                  {cities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.nameAr}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>رقم الترخيص</span>
                <input name="licenseNumber" maxLength={100} />
              </label>
              <label className="form-field full-field">
                <span>العنوان</span>
                <input name="address" maxLength={250} />
              </label>
              <label className="form-field">
                <span>الخطة الأولية</span>
                <select name="planId">
                  <option value="">دون خطة</option>
                  {plans
                    .filter((plan) => plan.isActive)
                    .map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} · {plan.priceLyd} د.ل
                      </option>
                    ))}
                </select>
              </label>
              <label className="form-field">
                <span>حالة المعرض</span>
                <select name="status" defaultValue="Verified">
                  <option value="Verified">موثق</option>
                  <option value="PendingReview">بانتظار المراجعة</option>
                </select>
              </label>
              <label className="check-field full-field">
                <input type="checkbox" name="activateSubscription" />
                <span>تفعيل الخطة إداريًا الآن دون انتظار دفع إلكتروني</span>
              </label>
            </div>
            <div className="form-note">
              إذا لم تُفعّل الخطة الآن فسيظهر للمعرض طلب دفع إلكتروني في حسابه.
              لا تُعرض كلمة السر مرة أخرى بعد الحفظ.
            </div>
            <div className="form-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setDealerFormOpen(false)}
              >
                إلغاء
              </button>
              <button
                className="primary-button"
                disabled={busy === "create-dealer"}
              >
                {busy === "create-dealer" ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Save size={17} />
                )}{" "}
                إنشاء الحساب
              </button>
            </div>
          </form>
        </div>
      )}

      {planFormOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setPlanFormOpen(false)
          }
        >
          <form className="vehicle-form plan-editor" onSubmit={savePlan}>
            <div className="form-header">
              <div>
                <p>قواعد ديناميكية</p>
                <h2>{editingPlanId ? "تعديل الخطة" : "خطة اشتراك جديدة"}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                title="إغلاق"
                onClick={() => setPlanFormOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="form-grid">
              <PlanInput label="الرمز *">
                <input
                  required
                  value={planForm.code}
                  onChange={(e) =>
                    setPlanForm({ ...planForm, code: e.target.value })
                  }
                  dir="ltr"
                />
              </PlanInput>
              <PlanInput label="الاسم *">
                <input
                  required
                  value={planForm.name}
                  onChange={(e) =>
                    setPlanForm({ ...planForm, name: e.target.value })
                  }
                />
              </PlanInput>
              <label className="form-field full-field">
                <span>وصف الخطة</span>
                <textarea
                  maxLength={600}
                  value={planForm.description}
                  onChange={(e) =>
                    setPlanForm({ ...planForm, description: e.target.value })
                  }
                />
              </label>
              <PlanInput label="نوع المشترك">
                <select
                  value={planForm.audience}
                  onChange={(e) =>
                    setPlanForm({
                      ...planForm,
                      audience: e.target.value as
                        "Dealer" | "Customer" | "Both",
                    })
                  }
                >
                  <option value="Dealer">معرض / بائع</option>
                  <option value="Customer">مستخدم / مشترٍ</option>
                  <option value="Both">الجميع</option>
                </select>
              </PlanInput>
              <PlanInput label="السعر د.ل *">
                <input
                  required
                  type="number"
                  min="0"
                  step="0.001"
                  value={planForm.priceLyd}
                  onChange={(e) =>
                    setPlanForm({ ...planForm, priceLyd: e.target.value })
                  }
                />
              </PlanInput>
              <PlanInput label="المدة بالأيام *">
                <input
                  required
                  type="number"
                  min="1"
                  value={planForm.durationDays}
                  onChange={(e) =>
                    setPlanForm({ ...planForm, durationDays: e.target.value })
                  }
                />
              </PlanInput>
              <PlanInput label="حد السيارات">
                <input
                  type="number"
                  min="1"
                  value={planForm.vehicleLimit}
                  onChange={(e) =>
                    setPlanForm({ ...planForm, vehicleLimit: e.target.value })
                  }
                />
              </PlanInput>
              <PlanInput label="حد المزادات">
                <input
                  type="number"
                  min="1"
                  value={planForm.auctionLimit}
                  onChange={(e) =>
                    setPlanForm({ ...planForm, auctionLimit: e.target.value })
                  }
                />
              </PlanInput>
              <PlanInput label="حد سيارات جلسة المزاد">
                <input
                  type="number"
                  min="1"
                  value={planForm.auctionVehicleLimit}
                  onChange={(e) =>
                    setPlanForm({
                      ...planForm,
                      auctionVehicleLimit: e.target.value,
                    })
                  }
                />
              </PlanInput>
              <PlanInput label="حد الموظفين">
                <input
                  type="number"
                  min="1"
                  value={planForm.staffLimit}
                  onChange={(e) =>
                    setPlanForm({ ...planForm, staffLimit: e.target.value })
                  }
                />
              </PlanInput>
              <PlanInput label="نموذج الرسوم">
                <select
                  value={planForm.billingModel}
                  onChange={(e) =>
                    setPlanForm({ ...planForm, billingModel: e.target.value })
                  }
                >
                  <option value="Subscription">اشتراك</option>
                  <option value="Commission">عمولة</option>
                  <option value="Hybrid">اشتراك وعمولة</option>
                </select>
              </PlanInput>
              <PlanInput label="رسوم السيارة الإضافية">
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={planForm.extraVehicleFeeLyd}
                  onChange={(e) =>
                    setPlanForm({
                      ...planForm,
                      extraVehicleFeeLyd: e.target.value,
                    })
                  }
                />
              </PlanInput>
              <PlanInput label="نسبة العمولة %">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={planForm.commissionRate}
                  onChange={(e) =>
                    setPlanForm({ ...planForm, commissionRate: e.target.value })
                  }
                />
              </PlanInput>
              <div className="plan-permission-editor full-field">
                <div>
                  <strong>صلاحيات الخطة</strong>
                  <small>
                    تعطيل الصلاحية يمنع العملية من الـBackend، وليس من الواجهة
                    فقط.
                  </small>
                </div>
                <section>
                  {capabilities
                    .filter(
                      (capability) =>
                        capability.isActive ||
                        planForm.permissions.includes(capability.code),
                    )
                    .map((capability) => (
                    <label className="check-field" key={capability.code}>
                      <input
                        type="checkbox"
                        checked={planForm.permissions.includes(capability.code)}
                        onChange={(event) =>
                          setPlanForm({
                            ...planForm,
                            permissions: event.target.checked
                              ? [...planForm.permissions, capability.code]
                              : planForm.permissions.filter(
                                  (code) => code !== capability.code,
                                ),
                          })
                        }
                      />
                      <span>
                        {capability.label}
                        <small dir="ltr">{capability.code}</small>
                      </span>
                    </label>
                    ))}
                </section>
              </div>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={planForm.searchBoostEnabled}
                  onChange={(e) =>
                    setPlanForm({
                      ...planForm,
                      searchBoostEnabled: e.target.checked,
                    })
                  }
                />
                <span>تعزيز الظهور في البحث</span>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={planForm.adsIncluded}
                  onChange={(e) =>
                    setPlanForm({ ...planForm, adsIncluded: e.target.checked })
                  }
                />
                <span>إعلانات مشمولة</span>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={planForm.isActive}
                  onChange={(e) =>
                    setPlanForm({ ...planForm, isActive: e.target.checked })
                  }
                />
                <span>الخطة متاحة للاشتراك</span>
              </label>
            </div>
            <div className="form-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setPlanFormOpen(false)}
              >
                إلغاء
              </button>
              <button className="primary-button" disabled={busy === "plan"}>
                <Save size={17} /> حفظ الخطة
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

function PlanInput({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
