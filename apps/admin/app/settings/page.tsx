"use client";

import {
  ArrowRight,
  CheckCircle2,
  Gavel,
  ImageIcon,
  LoaderCircle,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type SettingRecord = {
  key: string;
  editable: boolean;
  value: unknown;
  isDefault: boolean;
  updatedAt: string | null;
};
type MediaStatus = { provider: "cloudinary" | "local"; cloudName: string | null; folder: string | null };

const labels: Record<string, { title: string; hint: string; group: string }> = {
  "auction.publisher_subscription_required": { title: "إلزام اشتراك نشر المزاد", hint: "يشترط باقة نشر فعّالة وحصة متاحة. اشتراك النشر منفصل عن تأمين المزايدة.", group: "المزاد" },
  "platform.logo_url": {
    title: "شعار المنصة",
    hint: "الشعار الظاهر في تطبيق الهاتف.",
    group: "الهوية البصرية",
  },
  "auction.deposit_basis_points": {
    title: "نسبة العربون (نقاط أساس)",
    hint: "100 نقطة = 1%، و1000 = 10%.",
    group: "المدفوعات",
  },
  "auction.buyer_fee_milli": {
    title: "رسوم الشراء (مِلّي دينار)",
    hint: "1000 تساوي ديناراً واحداً.",
    group: "المدفوعات",
  },
  "auction.listing_fee_milli": {
    title: "رسوم إدخال سيارة للمزاد (مِلّي دينار)",
    hint: "50000 تساوي 50 د.ل، وتظهر للمستخدم قبل إنشاء الطلب.",
    group: "المدفوعات",
  },
  "auction.listing_order_expiry_minutes": {
    title: "مهلة دفع طلب المزاد بالدقائق",
    hint: "بعد انتهائها لا يمكن دفع الطلب ويجب إنشاء طلب جديد.",
    group: "المدفوعات",
  },
  "platform.guest_mode_enabled": {
    title: "وضع الزائر",
    hint: "يسمح بتصفح المنصة دون حساب.",
    group: "المنصة",
  },
  "platform.maintenance_mode": {
    title: "وضع الصيانة",
    hint: "إشارة مركزية تستخدمها الواجهات لمنع الاستخدام العام.",
    group: "المنصة",
  },
  "auction.section_state": {
    title: "حالة قسم المزاد",
    hint: "فتح أو إغلاق قسم المزادات بالكامل.",
    group: "المزاد",
  },
  "auction.mode": {
    title: "نمط تشغيل المزاد",
    hint: "دائم، مجدول، أو بموعد يقترحه المعرض.",
    group: "المزاد",
  },
  "auction.bid_increment_milli": {
    title: "الزيادة الدنيا (مِلّي دينار)",
    hint: "1000 تساوي ديناراً واحداً.",
    group: "المزاد",
  },
  "auction.round_seconds": {
    title: "مدة الجولة السريعة (ثانية)",
    hint: "120 ثانية = دقيقتان. تطبق على المزادات السريعة الجديدة فقط.",
    group: "المزاد",
  },
  "auction.bid_wallet_mode": {
    title: "شرط رصيد المحفظة للمزايدة",
    hint: "مبلغ ثابت أو نسبة من السعر الاحتياطي، ومن السعر الابتدائي عند عدم وجوده.",
    group: "المزاد",
  },
  "auction.bid_wallet_fixed_milli": {
    title: "الحد الثابت للمحفظة (مِلّي دينار)",
    hint: "100000 تساوي 100 د.ل. الرصيد مطلوب للأهلية ولا يُخصم عند المزايدة.",
    group: "المزاد",
  },
  "auction.bid_wallet_basis_points": {
    title: "نسبة رصيد الأهلية (نقاط أساس)",
    hint: "1000 نقطة تساوي 10% من سعر السيارة المطلوب.",
    group: "المزاد",
  },
  "auction.anti_sniping_enabled": {
    title: "تمديد آخر اللحظات",
    hint: "تشغيل Anti-Sniping.",
    group: "المزاد",
  },
  "auction.anti_sniping_window_seconds": {
    title: "نافذة التمديد بالثواني",
    hint: "الفترة قبل النهاية التي تفعّل التمديد.",
    group: "المزاد",
  },
  "auction.anti_sniping_extension_seconds": {
    title: "مدة التمديد بالثواني",
    hint: "الوقت المضاف بعد المزايدة المتأخرة.",
    group: "المزاد",
  },
  "auction.winner_payment_deadline_minutes": {
    title: "مهلة دفع الفائز بالدقائق",
    hint: "تبدأ بعد إعلان النتيجة.",
    group: "المدفوعات",
  },
  "auction.fallback_winners": {
    title: "عدد الفائزين الاحتياطيين",
    hint: "0 إلى 2 بعد الفائز الأول.",
    group: "المدفوعات",
  },
  "auction.auto_relist": {
    title: "إعادة الإدراج تلقائياً",
    hint: "عند فشل جميع الفائزين.",
    group: "المدفوعات",
  },
  "comments.enabled": {
    title: "التعليقات",
    hint: "تشغيل التعليقات على مستوى المنصة.",
    group: "المحتوى",
  },
  "notifications.auction_reminder_minutes": {
    title: "تذكيرات المزاد بالدقائق",
    hint: "قيم مفصولة بفاصلة، مثل 60,30,15,5.",
    group: "الإشعارات",
  },
};

export default function SettingsPage() {
  const [items, setItems] = useState<SettingRecord[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoVersion, setLogoVersion] = useState(() => Date.now());
  const [mediaStatus, setMediaStatus] = useState<MediaStatus | null>(null);

  async function load() {
    const [response, mediaResponse] = await Promise.all([
      fetch("/api/admin/settings", { cache: "no-store" }),
      fetch("/api/admin/settings/media-status", { cache: "no-store" }),
    ]);
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok) throw new Error("تعذر تحميل الإعدادات");
    setItems((await response.json()) as SettingRecord[]);
    if (mediaResponse.ok) setMediaStatus(await mediaResponse.json() as MediaStatus);
  }

  useEffect(() => {
    void load().catch((caught) =>
      setError(caught instanceof Error ? caught.message : "تعذر التحميل"),
    );
  }, []);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview(null);
      return;
    }
    const preview = URL.createObjectURL(logoFile);
    setLogoPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [logoFile]);

  const groups = useMemo(
    () =>
      Array.from(
        new Set(items.filter((item) => item.key !== "platform.logo_url").map((item) => labels[item.key]?.group ?? "أخرى")),
      ),
    [items],
  );

  async function update(key: string, value: unknown) {
    setSaving(key);
    setError("");
    setMessage("");
    try {
    const response = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    const body = (await response.json()) as { message?: string };
    if (!response.ok) {
      setError(body.message || "تعذر حفظ الإعداد");
      setSaving(null);
      return;
    }
    setItems((current) =>
      current.map((item) =>
        item.key === key
          ? {
              ...item,
              value,
              isDefault: false,
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    );
    setMessage("تم حفظ الإعداد وتسجيل التغيير في سجل التدقيق.");
    } catch { setError("تعذر الاتصال بالخادم. أعد المحاولة."); }
    finally { setSaving(null); }
  }

  const logoSetting = items.find((item) => item.key === "platform.logo_url");
  const hasStoredLogo = typeof logoSetting?.value === "string" && logoSetting.value.length > 0;

  async function uploadLogo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!logoFile) return;
    setSaving("platform.logo_url");
    setError("");
    setMessage("");
    try {
      const data = new FormData();
      data.append("logo", logoFile);
      const response = await fetch("/api/admin/settings/logo", { method: "POST", body: data });
      const body = await response.json() as { value?: unknown; updatedAt?: string; message?: string };
      if (!response.ok) throw new Error(body.message || "تعذر رفع الشعار");
      setItems((current) => current.map((item) => item.key === "platform.logo_url"
        ? { ...item, value: body.value, isDefault: false, updatedAt: body.updatedAt ?? new Date().toISOString() }
        : item));
      setLogoFile(null);
      setLogoVersion(Date.now());
      setMessage("تم تحديث شعار المنصة، وسيظهر في التطبيق عند التحديث.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر رفع الشعار");
    } finally {
      setSaving(null);
    }
  }

  async function removeLogo() {
    setSaving("platform.logo_url");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/settings/logo", { method: "DELETE" });
      const body = await response.json() as { updatedAt?: string; message?: string };
      if (!response.ok) throw new Error(body.message || "تعذر حذف الشعار");
      setItems((current) => current.map((item) => item.key === "platform.logo_url"
        ? { ...item, value: "", isDefault: false, updatedAt: body.updatedAt ?? new Date().toISOString() }
        : item));
      setLogoFile(null);
      setMessage("تم حذف الشعار المخصص وسيستخدم التطبيق الرمز الافتراضي.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حذف الشعار");
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="management-page">
      <header className="management-header">
        <div>
          <a href="/">
            <ArrowRight size={17} /> العودة للوحة
          </a>
          <h1>إعدادات النظام</h1>
        </div>
        <Settings2 size={30} />
      </header>
      {message ? (
        <div className="notice success">
          <CheckCircle2 size={18} />
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="notice error">
          <ShieldCheck size={18} />
          {error}
        </div>
      ) : null}
      <section className="settings-group branding-settings">
        <div className="settings-group-title">
          <ImageIcon size={18} />
          <h2>الهوية البصرية</h2>
        </div>
        <form className="branding-logo-form" onSubmit={uploadLogo}>
          <div className="branding-logo-preview">
            {logoPreview || hasStoredLogo ? (
              <img src={logoPreview ?? `/api/admin/settings/logo/file?v=${logoVersion}`} alt="معاينة شعار المنصة" />
            ) : (
              <ImageIcon size={34} />
            )}
          </div>
          <div className="branding-logo-copy">
            <strong>شعار تطبيق الهاتف</strong>
            <p>استخدم صورة PNG أو JPEG أو WebP بحجم لا يتجاوز 2MB. يفضّل شعار مربع بخلفية شفافة.</p>
            <small className={mediaStatus?.provider === "cloudinary" ? "storage-provider active" : "storage-provider"}>
              {mediaStatus?.provider === "cloudinary" ? `Cloudinary متصل · ${mediaStatus.cloudName}` : "التخزين المحلي مفعّل للتطوير"}
            </small>
            <label className="logo-file-picker">
              <Upload size={17} />
              <span>{logoFile ? logoFile.name : "اختيار صورة"}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)} />
            </label>
          </div>
          <div className="branding-logo-actions">
            <button className="primary-button" disabled={!logoFile || saving === "platform.logo_url"} type="submit">
              {saving === "platform.logo_url" ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}
              حفظ الشعار
            </button>
            {hasStoredLogo ? (
              <button className="secondary-button danger-button" disabled={saving === "platform.logo_url"} type="button" onClick={() => void removeLogo()}>
                <Trash2 size={17} /> حذف
              </button>
            ) : null}
          </div>
        </form>
      </section>
      {groups.map((group) => (
        <section className="settings-group" key={group}>
          <div className="settings-group-title">
            <Gavel size={18} />
            <h2>{group}</h2>
          </div>
          {items
            .filter((item) => item.key !== "platform.logo_url")
            .filter((item) => (labels[item.key]?.group ?? "أخرى") === group)
            .map((item) => (
              <SettingRow
                key={item.key}
                item={item}
                saving={saving === item.key}
                onSave={update}
              />
            ))}
        </section>
      ))}
    </main>
  );
}

function SettingRow({
  item,
  saving,
  onSave,
}: {
  item: SettingRecord;
  saving: boolean;
  onSave: (key: string, value: unknown) => Promise<void>;
}) {
  const meta = labels[item.key] ?? { title: item.key, hint: "", group: "" };
  const [draft, setDraft] = useState(formatValue(item.value));
  useEffect(() => setDraft(formatValue(item.value)), [item.value]);
  const booleanValue = typeof item.value === "boolean";
  const options =
    item.key === "auction.section_state"
      ? ["Open", "Closed"]
      : item.key === "auction.mode"
        ? ["AlwaysOpen", "Scheduled", "DealerScheduled"]
        : item.key === "auction.bid_wallet_mode"
          ? ["Fixed", "Percentage"]
        : null;
  const parsedValue = () =>
    Array.isArray(item.value)
      ? draft
          .split(",")
          .map((part) => Number(part.trim()))
          .filter(Number.isFinite)
      : typeof item.value === "number"
        ? Number(draft)
        : draft;
  return (
    <article className="setting-row">
      <div>
        <strong>{meta.title}</strong>
        <p>{meta.hint}</p>
        <small>
          {item.isDefault
            ? "القيمة الافتراضية"
            : `آخر تحديث: ${item.updatedAt ? new Date(item.updatedAt).toLocaleString("ar-LY") : "غير معروف"}`}
        </small>
      </div>
      <div className="setting-control">
        {!item.editable ? <span className="status-chip">غير متاح بعد</span> : booleanValue ? (
          <button
            className={item.value ? "setting-toggle active" : "setting-toggle"}
            role="switch"
            aria-checked={Boolean(item.value)}
            aria-label={meta.title}
            disabled={saving}
            type="button"
            onClick={() => void onSave(item.key, !item.value)}
          >
            <span />
            {item.value ? "مفعّل" : "موقوف"}
          </button>
        ) : options ? (
          <select
            aria-label={meta.title}
            disabled={saving}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              void onSave(item.key, event.target.value);
            }}
          >
            {options.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        ) : (
          <>
            <input
              aria-label={meta.title}
              type={typeof item.value === 'number' ? 'number' : 'text'}
              disabled={saving}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button
              className="icon-button"
              disabled={saving}
              title="حفظ"
              type="button"
              onClick={() => void onSave(item.key, parsedValue())}
            >
              {saving ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Save size={17} />
              )}
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function formatValue(value: unknown) {
  return Array.isArray(value) ? value.join(",") : String(value);
}
