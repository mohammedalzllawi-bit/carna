"use client";

import {
  ArrowLeft,
  ArrowRight,
  CreditCard,
  Edit3,
  Eye,
  EyeOff,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Payment = {
  id: string;
  orderId: string;
  userName: string | null;
  status: string;
  amountLyd: number;
  currency: string;
  provider: string;
  createdAt: string;
  order: { type: string; status: string; expiresAt: string | null };
};
type Results = {
  items: Payment[];
  total: number;
  pageSize: number;
  counts: Record<string, number>;
};
type Detail = {
  id: string;
  status: string;
  provider: string;
  amountLyd: number;
  currency: string;
  providerTransactionId: string | null;
  order: Payment["order"] & { id: string };
  transactions: {
    id: string;
    status: string;
    amountLyd: number;
    currency: string;
    createdAt: string;
    webhookVerified: boolean;
    reviewRequired: boolean;
  }[];
  ledger: {
    id: string;
    type: string;
    direction: string;
    amountLyd: number;
    currency: string;
    createdAt: string;
  }[];
};
type Provider = {
  code: string;
  name: string;
  configured: boolean;
  active: boolean;
  storedAsActive: boolean;
  envVariables: string[];
  minimumRechargeLyd: number | null;
  maximumRechargeLyd: number | null;
  fixedFeeLyd: number | null;
  percentageFee: number | null;
};
type ProviderForm = {
  code: string;
  name: string;
  envVariables: string;
  minimumRechargeLyd: string;
  maximumRechargeLyd: string;
  fixedFeeLyd: string;
  percentageFee: string;
  active: boolean;
  configured: boolean;
};
const emptyProvider: ProviderForm = {
  code: "",
  name: "",
  envVariables: "",
  minimumRechargeLyd: "",
  maximumRechargeLyd: "",
  fixedFeeLyd: "",
  percentageFee: "",
  active: false,
  configured: false,
};
type Fee = {
  id: string;
  code: string;
  name: string;
  calculation: "Fixed" | "Percentage";
  amountLyd: number | null;
  rate: number | null;
  minimumLyd: number | null;
  maximumLyd: number | null;
  planIds: string[];
  userIds: string[];
  dealerIds: string[];
  isActive: boolean;
};
type Plan = { id: string; name: string };
type FeeForm = {
  code: string;
  name: string;
  calculation: "Fixed" | "Percentage";
  amountLyd: string;
  rate: string;
  minimumLyd: string;
  maximumLyd: string;
  planIds: string[];
  userIds: string;
  dealerIds: string;
  isActive: boolean;
};
const emptyFee: FeeForm = {
  code: "",
  name: "",
  calculation: "Fixed",
  amountLyd: "",
  rate: "",
  minimumLyd: "",
  maximumLyd: "",
  planIds: [],
  userIds: "",
  dealerIds: "",
  isActive: true,
};
const labels: Record<string, string> = {
  Pending: "قيد الانتظار",
  Processing: "قيد المعالجة",
  Paid: "مدفوع",
  Failed: "فشل",
  Cancelled: "ملغى",
  Refunded: "مسترد",
  PartiallyRefunded: "استرداد جزئي",
  PaymentPending: "بانتظار الدفع",
  Expired: "انتهت المهلة",
};
const orderLabels: Record<string, string> = {
  AuctionDeposit: "عربون مزاد",
  AuctionListingFee: "رسوم إدخال مزاد",
  InspectionFee: "رسوم فحص",
  DealerSubscription: "اشتراك معرض",
  Advertisement: "إعلان",
};
const money = (value: number, currency: string) =>
  new Intl.NumberFormat("ar-LY", {
    style: "currency",
    currency,
    maximumFractionDigits: 3,
  }).format(value);
const date = (value: string) => new Date(value).toLocaleString("ar-LY");

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { cache: "no-store", signal });
  if (response.status === 401) {
    location.href = "/login";
    throw new Error("انتهت الجلسة");
  }
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? "لا تملك صلاحية الاطلاع على المدفوعات."
        : "تعذر تحميل المدفوعات.",
    );
  return response.json();
}

async function mutate<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json()) as T & { message?: string | string[] };
  if (!response.ok)
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join("، ")
        : result.message || "تعذر تنفيذ العملية",
    );
  return result;
}

export default function PaymentsPage() {
  const [results, setResults] = useState<Results | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerForm, setProviderForm] = useState<ProviderForm>(emptyProvider);
  const [providerEditorOpen, setProviderEditorOpen] = useState(false);
  const [fees, setFees] = useState<Fee[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [feeForm, setFeeForm] = useState<FeeForm>(emptyFee);
  const [feeEditorOpen, setFeeEditorOpen] = useState(false);
  const [editingFeeId, setEditingFeeId] = useState<string | null>(null);
  const [feeBusy, setFeeBusy] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const [paymentData, providerData, feeData, planData] =
          await Promise.all([
            get<Results>(
              `/api/admin/payments?page=${page}${status ? `&status=${status}` : ""}`,
              signal,
            ),
            get<Provider[]>("/api/admin/payments/providers", signal),
            get<Fee[]>("/api/admin/payments/fees", signal),
            get<Plan[]>("/api/admin/dealers/plans", signal),
          ]);
        setResults(paymentData);
        setProviders(providerData);
        setFees(feeData);
        setPlans(planData);
      } catch (error) {
        if (!signal?.aborted)
          setError(error instanceof Error ? error.message : "تعذر الاتصال");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [page, status],
  );
  useEffect(() => {
    const abort = new AbortController();
    void load(abort.signal);
    return () => abort.abort();
  }, [load]);
  async function open(id: string) {
    setOpening(id);
    setError("");
    try {
      setDetail(await get<Detail>(`/api/admin/payments/${id}`));
    } catch (error) {
      setError(error instanceof Error ? error.message : "تعذر الاتصال");
    } finally {
      setOpening(null);
    }
  }

  function openFee(fee?: Fee) {
    setEditingFeeId(fee?.id ?? null);
    setFeeForm(
      fee
        ? {
            code: fee.code,
            name: fee.name,
            calculation: fee.calculation,
            amountLyd: fee.amountLyd?.toString() ?? "",
            rate: fee.rate?.toString() ?? "",
            minimumLyd: fee.minimumLyd?.toString() ?? "",
            maximumLyd: fee.maximumLyd?.toString() ?? "",
            planIds: fee.planIds,
            userIds: fee.userIds.join(", "),
            dealerIds: fee.dealerIds.join(", "),
            isActive: fee.isActive,
          }
        : emptyFee,
    );
    setFeeEditorOpen(true);
  }

  async function saveFee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeeBusy("save");
    setError("");
    const splitIds = (value: string) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    try {
      await mutate(
        editingFeeId
          ? `/api/admin/payments/fees/${editingFeeId}`
          : "/api/admin/payments/fees",
        editingFeeId ? "PATCH" : "POST",
        {
          ...feeForm,
          amountLyd: feeForm.amountLyd || undefined,
          rate: feeForm.rate ? Number(feeForm.rate) : undefined,
          minimumLyd: feeForm.minimumLyd || undefined,
          maximumLyd: feeForm.maximumLyd || undefined,
          userIds: splitIds(feeForm.userIds),
          dealerIds: splitIds(feeForm.dealerIds),
        },
      );
      setFeeEditorOpen(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ الرسم");
    } finally {
      setFeeBusy("");
    }
  }

  async function archiveFee(fee: Fee) {
    setFeeBusy(fee.id);
    setError("");
    try {
      await mutate(`/api/admin/payments/fees/${fee.id}`, "DELETE");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إيقاف الرسم");
    } finally {
      setFeeBusy("");
    }
  }

  function openProvider(provider?: Provider) {
    setProviderForm(
      provider
        ? {
            code: provider.code,
            name: provider.name,
            envVariables: provider.envVariables.join(", "),
            minimumRechargeLyd: provider.minimumRechargeLyd?.toString() ?? "",
            maximumRechargeLyd: provider.maximumRechargeLyd?.toString() ?? "",
            fixedFeeLyd: provider.fixedFeeLyd?.toString() ?? "",
            percentageFee: provider.percentageFee?.toString() ?? "",
            active: provider.storedAsActive,
            configured: provider.configured,
          }
        : emptyProvider,
    );
    setProviderEditorOpen(true);
  }

  async function saveProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeeBusy("provider");
    setError("");
    try {
      await mutate("/api/admin/payments/providers", "POST", {
        code: providerForm.code,
        name: providerForm.name,
        envVariables: providerForm.envVariables
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        minimumRechargeLyd: providerForm.minimumRechargeLyd || undefined,
        maximumRechargeLyd: providerForm.maximumRechargeLyd || undefined,
        fixedFeeLyd: providerForm.fixedFeeLyd || undefined,
        percentageFee: providerForm.percentageFee
          ? Number(providerForm.percentageFee)
          : undefined,
        active: providerForm.active,
      });
      setProviderEditorOpen(false);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "تعذر حفظ طريقة الدفع",
      );
    } finally {
      setFeeBusy("");
    }
  }
  return (
    <main className="management-page">
      <header className="management-header">
        <div>
          <a href="/">
            <ArrowRight size={17} /> لوحة الإدارة
          </a>
          <h1>المدفوعات</h1>
        </div>
        <button
          className="icon-button"
          title="تحديث"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw size={19} />
        </button>
      </header>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {results && (
        <section className="mini-stats">
          <div>
            <strong>{results.counts.Paid ?? 0}</strong>
            <span>مدفوعات مؤكدة</span>
          </div>
          <div>
            <strong>
              {(results.counts.Pending ?? 0) + (results.counts.Processing ?? 0)}
            </strong>
            <span>بانتظار التأكيد</span>
          </div>
          <div>
            <strong>{results.counts.Failed ?? 0}</strong>
            <span>مدفوعات فاشلة</span>
          </div>
        </section>
      )}
      <section className="payment-provider-strip">
        <div>
          <strong>بوابات الدفع الإلكتروني</strong>
          <small>
            لا يمكن التفعيل قبل تركيب Adapter رسمي والتحقق من Webhook.
          </small>
          <button className="secondary-button" onClick={() => openProvider()}>
            <Plus size={15} /> إضافة طريقة
          </button>
        </div>
        {providers.map((provider) => (
          <span
            className={
              provider.active ? "provider-state active" : "provider-state"
            }
            key={provider.code}
          >
            <CreditCard size={15} />
            <b>{provider.name}</b>
            <small>
              {provider.active
                ? "مفعّل"
                : provider.configured
                  ? "جاهز لكنه موقوف"
                  : "يحتاج تكامل رسمي"}
            </small>
            <button
              className="icon-button"
              title="إعدادات طريقة الدفع"
              onClick={() => openProvider(provider)}
            >
              <Edit3 size={14} />
            </button>
          </span>
        ))}
      </section>
      <section className="panel fee-manager">
        <div className="panel-header">
          <div>
            <p className="eyebrow">مبالغ ثابتة أو نسب وقواعد تطبيق مخصصة</p>
            <h2>الرسوم والتعريفات</h2>
          </div>
          <button className="primary-button" onClick={() => openFee()}>
            <Plus size={16} /> رسم جديد
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الرسم</th>
                <th>طريقة الحساب</th>
                <th>الحدود</th>
                <th>نطاق التطبيق</th>
                <th>الحالة</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {fees.map((fee) => (
                <tr key={fee.id}>
                  <td>
                    <strong>{fee.name}</strong>
                    <small dir="ltr">{fee.code}</small>
                  </td>
                  <td>
                    {fee.calculation === "Fixed"
                      ? money(fee.amountLyd ?? 0, "LYD")
                      : `${fee.rate ?? 0}%`}
                  </td>
                  <td>
                    {fee.minimumLyd !== null || fee.maximumLyd !== null
                      ? `${fee.minimumLyd ?? 0} - ${fee.maximumLyd ?? "∞"} د.ل`
                      : "دون حدود"}
                  </td>
                  <td>
                    {fee.planIds.length
                      ? `${fee.planIds.length} باقة`
                      : fee.userIds.length || fee.dealerIds.length
                        ? `${fee.userIds.length} مستخدم · ${fee.dealerIds.length} معرض`
                        : "الجميع"}
                  </td>
                  <td>
                    <span
                      className={
                        fee.isActive
                          ? "status-chip status-published"
                          : "status-chip"
                      }
                    >
                      {fee.isActive ? "مفعّل" : "موقوف"}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="icon-button"
                        title="تعديل الرسم"
                        onClick={() => openFee(fee)}
                      >
                        <Edit3 size={16} />
                      </button>
                      {fee.isActive && (
                        <button
                          className="icon-button danger-button"
                          title="إيقاف الرسم"
                          disabled={feeBusy === fee.id}
                          onClick={() => void archiveFee(fee)}
                        >
                          <EyeOff size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!fees.length && (
            <p className="detail-empty">لم تُنشأ رسوم مخصصة بعد.</p>
          )}
        </div>
      </section>
      <div className="toolbar">
        <label>
          حالة الدفع{" "}
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">جميع الحالات</option>
            {[
              "Pending",
              "Processing",
              "Paid",
              "Failed",
              "Cancelled",
              "Refunded",
              "PartiallyRefunded",
            ].map((value) => (
              <option value={value} key={value}>
                {labels[value]}
              </option>
            ))}
          </select>
        </label>
        <span>{results?.total ?? 0} معاملة</span>
      </div>
      {loading ? (
        <div className="loading-state">
          <LoaderCircle size={24} className="spin" /> جارٍ التحميل
        </div>
      ) : (
        results && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>المستخدم</th>
                  <th>الطلب</th>
                  <th>المبلغ</th>
                  <th>المزود</th>
                  <th>الحالة</th>
                  <th>التاريخ</th>
                  <th>التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {results.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.userName || "غير مسمى"}</td>
                    <td>
                      {orderLabels[item.order.type] ?? item.order.type}
                      <small>
                        {labels[item.order.status] ?? item.order.status}
                      </small>
                    </td>
                    <td>{money(item.amountLyd, item.currency)}</td>
                    <td>{item.provider}</td>
                    <td>{labels[item.status] ?? item.status}</td>
                    <td>{date(item.createdAt)}</td>
                    <td>
                      <button
                        className="icon-button"
                        title="تفاصيل المعاملة"
                        disabled={opening !== null}
                        onClick={() => void open(item.id)}
                      >
                        {opening === item.id ? (
                          <LoaderCircle className="spin" size={18} />
                        ) : (
                          <Eye size={18} />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!results.items.length && (
              <div className="empty-state">
                <CreditCard size={32} />
                <h3>لا توجد مدفوعات بهذه الحالة</h3>
              </div>
            )}
          </div>
        )
      )}
      <div className="form-actions">
        <button
          className="icon-button"
          title="الصفحة السابقة"
          disabled={loading || page === 1}
          onClick={() => setPage((value) => value - 1)}
        >
          <ArrowRight size={18} />
        </button>
        <span>الصفحة {page}</span>
        <button
          className="icon-button"
          title="الصفحة التالية"
          disabled={
            loading || !results || page * results.pageSize >= results.total
          }
          onClick={() => setPage((value) => value + 1)}
        >
          <ArrowLeft size={18} />
        </button>
      </div>
      {providerEditorOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setProviderEditorOpen(false)
          }
        >
          <form className="vehicle-form provider-editor" onSubmit={saveProvider}>
            <header className="form-header">
              <div><p>لا تُخزن الأسرار هنا؛ تُضاف القيم إلى متغيرات بيئة الخادم</p><h2>طريقة الدفع</h2></div>
              <button className="icon-button" type="button" title="إغلاق" onClick={() => setProviderEditorOpen(false)}><X size={20} /></button>
            </header>
            <div className="form-grid">
              <label className="form-field"><span>الرمز *</span><input required dir="ltr" pattern="[a-z][a-z0-9-]+" value={providerForm.code} onChange={(event) => setProviderForm({ ...providerForm, code: event.target.value.toLowerCase() })} /></label>
              <label className="form-field"><span>الاسم *</span><input required value={providerForm.name} onChange={(event) => setProviderForm({ ...providerForm, name: event.target.value })} /></label>
              <label className="form-field full-field"><span>أسماء متغيرات البيئة المطلوبة</span><input dir="ltr" placeholder="PROVIDER_API_KEY, PROVIDER_WEBHOOK_SECRET" value={providerForm.envVariables} onChange={(event) => setProviderForm({ ...providerForm, envVariables: event.target.value })} /></label>
              <label className="form-field"><span>أقل شحن د.ل</span><input type="number" min="0" step="0.001" value={providerForm.minimumRechargeLyd} onChange={(event) => setProviderForm({ ...providerForm, minimumRechargeLyd: event.target.value })} /></label>
              <label className="form-field"><span>أعلى شحن د.ل</span><input type="number" min="0" step="0.001" value={providerForm.maximumRechargeLyd} onChange={(event) => setProviderForm({ ...providerForm, maximumRechargeLyd: event.target.value })} /></label>
              <label className="form-field"><span>رسم ثابت د.ل</span><input type="number" min="0" step="0.001" value={providerForm.fixedFeeLyd} onChange={(event) => setProviderForm({ ...providerForm, fixedFeeLyd: event.target.value })} /></label>
              <label className="form-field"><span>رسم نسبي %</span><input type="number" min="0" max="100" step="0.01" value={providerForm.percentageFee} onChange={(event) => setProviderForm({ ...providerForm, percentageFee: event.target.value })} /></label>
              <label className="check-field"><input type="checkbox" disabled={!providerForm.configured} checked={providerForm.active} onChange={(event) => setProviderForm({ ...providerForm, active: event.target.checked })} /><span>{providerForm.configured ? "تفعيل طريقة الدفع" : "يلزم تركيب Adapter رسمي قبل التفعيل"}</span></label>
            </div>
            <div className="form-actions"><button className="secondary-button" type="button" onClick={() => setProviderEditorOpen(false)}>إلغاء</button><button className="primary-button" disabled={feeBusy === "provider"}><Save size={16} /> حفظ الطريقة</button></div>
          </form>
        </div>
      )}
      {feeEditorOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setFeeEditorOpen(false)
          }
        >
          <form className="vehicle-form fee-editor" onSubmit={saveFee}>
            <header className="form-header">
              <div>
                <p>تُحفظ القواعد في قاعدة البيانات</p>
                <h2>{editingFeeId ? "تعديل الرسم" : "رسم جديد"}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                title="إغلاق"
                onClick={() => setFeeEditorOpen(false)}
              >
                <X size={20} />
              </button>
            </header>
            <div className="form-grid">
              <label className="form-field">
                <span>الرمز *</span>
                <input
                  required
                  dir="ltr"
                  pattern="[a-z][a-z0-9._-]+"
                  value={feeForm.code}
                  onChange={(event) =>
                    setFeeForm({
                      ...feeForm,
                      code: event.target.value.toLowerCase(),
                    })
                  }
                />
              </label>
              <label className="form-field">
                <span>الاسم *</span>
                <input
                  required
                  value={feeForm.name}
                  onChange={(event) =>
                    setFeeForm({ ...feeForm, name: event.target.value })
                  }
                />
              </label>
              <label className="form-field">
                <span>طريقة الحساب</span>
                <select
                  value={feeForm.calculation}
                  onChange={(event) =>
                    setFeeForm({
                      ...feeForm,
                      calculation: event.target.value as "Fixed" | "Percentage",
                    })
                  }
                >
                  <option value="Fixed">مبلغ ثابت</option>
                  <option value="Percentage">نسبة مئوية</option>
                </select>
              </label>
              {feeForm.calculation === "Fixed" ? (
                <label className="form-field">
                  <span>المبلغ د.ل *</span>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.001"
                    value={feeForm.amountLyd}
                    onChange={(event) =>
                      setFeeForm({ ...feeForm, amountLyd: event.target.value })
                    }
                  />
                </label>
              ) : (
                <label className="form-field">
                  <span>النسبة % *</span>
                  <input
                    required
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={feeForm.rate}
                    onChange={(event) =>
                      setFeeForm({ ...feeForm, rate: event.target.value })
                    }
                  />
                </label>
              )}
              <label className="form-field">
                <span>الحد الأدنى د.ل</span>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={feeForm.minimumLyd}
                  onChange={(event) =>
                    setFeeForm({ ...feeForm, minimumLyd: event.target.value })
                  }
                />
              </label>
              <label className="form-field">
                <span>الحد الأقصى د.ل</span>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={feeForm.maximumLyd}
                  onChange={(event) =>
                    setFeeForm({ ...feeForm, maximumLyd: event.target.value })
                  }
                />
              </label>
              <label className="form-field full-field">
                <span>الباقات المستهدفة</span>
                <select
                  multiple
                  value={feeForm.planIds}
                  onChange={(event) =>
                    setFeeForm({
                      ...feeForm,
                      planIds: Array.from(
                        event.target.selectedOptions,
                        (option) => option.value,
                      ),
                    })
                  }
                >
                  {plans.map((plan) => (
                    <option value={plan.id} key={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
                <small>
                  اتركها فارغة ليكون الرسم عامًا، أو اختر أكثر من باقة.
                </small>
              </label>
              <label className="form-field">
                <span>معرّفات المستخدمين</span>
                <input
                  dir="ltr"
                  placeholder="id1, id2"
                  value={feeForm.userIds}
                  onChange={(event) =>
                    setFeeForm({ ...feeForm, userIds: event.target.value })
                  }
                />
              </label>
              <label className="form-field">
                <span>معرّفات المعارض</span>
                <input
                  dir="ltr"
                  placeholder="id1, id2"
                  value={feeForm.dealerIds}
                  onChange={(event) =>
                    setFeeForm({ ...feeForm, dealerIds: event.target.value })
                  }
                />
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={feeForm.isActive}
                  onChange={(event) =>
                    setFeeForm({ ...feeForm, isActive: event.target.checked })
                  }
                />
                <span>الرسم مفعّل</span>
              </label>
            </div>
            <div className="form-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setFeeEditorOpen(false)}
              >
                إلغاء
              </button>
              <button className="primary-button" disabled={feeBusy === "save"}>
                <Save size={16} /> حفظ الرسم
              </button>
            </div>
          </form>
        </div>
      )}
      {detail && (
        <div className="modal-backdrop">
          <section
            className="vehicle-form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-title"
          >
            <header className="form-header">
              <h2 id="payment-title">تفاصيل المعاملة</h2>
              <button
                className="icon-button"
                title="إغلاق"
                onClick={() => setDetail(null)}
              >
                <X size={20} />
              </button>
            </header>
            <p>
              {money(detail.amountLyd, detail.currency)} ·{" "}
              {labels[detail.status]} · {detail.provider}
            </p>
            <p style={{ overflowWrap: "anywhere" }}>
              رقم المعاملة: {detail.providerTransactionId || detail.id}
            </p>
            <h3>أحداث الدفع</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>الحالة</th>
                    <th>المبلغ</th>
                    <th>التحقق</th>
                    <th>التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.transactions.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        {labels[entry.status]}
                        {entry.reviewRequired && (
                          <small>دفع متأخر، يحتاج مراجعة مالية</small>
                        )}
                      </td>
                      <td>{money(entry.amountLyd, entry.currency)}</td>
                      <td>{entry.webhookVerified ? "موثّق" : "غير موثّق"}</td>
                      <td>{date(entry.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!detail.transactions.length && <p>لا توجد أحداث دفع مسجلة.</p>}
            </div>
            <h3>حركات الحساب</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>الحركة</th>
                    <th>المبلغ</th>
                    <th>التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.ledger.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.direction === "Credit" ? "إضافة" : "خصم"}</td>
                      <td>{money(entry.amountLyd, entry.currency)}</td>
                      <td>{date(entry.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!detail.ledger.length && (
                <p>لا توجد حركات مالية لهذه المعاملة.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
