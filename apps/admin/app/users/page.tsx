"use client";

import {
  Archive,
  ArrowRight,
  Ban,
  CheckCircle2,
  LoaderCircle,
  KeyRound,
  Eye,
  Plus,
  Save,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type User = {
  id: string;
  phone: string;
  fullName?: string | null;
  status: string;
  phoneVerified: boolean;
  roles: string[];
  createdAt: string;
  lastLoginAt?: string | null;
  activity: {
    bids: number;
    payments: number;
    inspectionRequests: number;
    disputes: number;
  };
};
const statusLabels: Record<string, string> = {
  Active: "نشط",
  PendingVerification: "بانتظار التوثيق",
  Suspended: "موقوف",
  Banned: "محظور",
  ReviewRequired: "يحتاج مراجعة",
  Archived: "مؤرشف",
};
const roleLabels: Record<string, string> = {
  CUSTOMER: "مستخدم",
  TECHNICIAN: "فني",
  DEALER_OWNER: "مالك معرض",
  DEALER_STAFF: "موظف معرض",
  SUPPORT_AGENT: "دعم",
  AUCTION_MANAGER: "مدير مزادات",
  FINANCE_MANAGER: "مالية",
  CONTENT_MANAGER: "محتوى",
  ADMIN: "مدير",
  SUPER_ADMIN: "مدير عام",
};
type RoleOption = { code: string; name: string };

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const data = (await response.json()) as T & { message?: string | string[] };
  if (!response.ok)
    throw new Error(
      Array.isArray(data.message)
        ? data.message.join("، ")
        : data.message || "تعذر تنفيذ العملية",
    );
  return data;
}

export default function UsersAdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [editingRoles, setEditingRoles] = useState<User | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    password: "",
    role: "CUSTOMER",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setUsers(await fetchJson<User[]>("/api/admin/users"));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "تعذر تحميل المستخدمين",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    void fetch('/api/admin/roles').then(async (response) => {
      if (response.ok) setRoles((await response.json()).roles);
    }).catch(() => setError('تعذر تحميل الأدوار.'));
  }, [load]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value
      ? users.filter((user) =>
          `${user.fullName ?? ""} ${user.phone} ${user.roles.join(" ")}`
            .toLowerCase()
            .includes(value),
        )
      : users;
  }, [query, users]);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await fetchJson("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          fullName: form.fullName,
          phone: form.phone,
          password: form.password,
          ...(roles.length ? { roles: [form.role] } : {}),
        }),
      });
      setFormOpen(false);
      setForm({ fullName: "", phone: "", password: "", role: "CUSTOMER" });
      setMessage("تم إنشاء الحساب بنجاح.");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "تعذر إنشاء المستخدم",
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateUser(
    id: string,
    data: Record<string, unknown>,
    successMessage: string,
  ) {
    setError("");
    try {
      await fetchJson(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      setMessage(successMessage);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "تعذر تحديث المستخدم",
      );
    }
  }

  async function archiveUser(id: string) {
    if (!window.confirm("أرشفة الحساب مع الاحتفاظ بسجلاته؟")) return;
    try {
      await fetchJson(`/api/admin/users/${id}`, { method: "DELETE" });
      setMessage("تمت أرشفة الحساب.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر أرشفة الحساب");
    }
  }

  async function saveRoles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingRoles) return;
    setSaving(true); setError('');
    try {
      await fetchJson(`/api/admin/users/${editingRoles.id}`, { method: 'PATCH', body: JSON.stringify({ roles: selectedRoles }) });
      setEditingRoles(null); setMessage('تم تحديث الأدوار وإبطال جلسات الحساب السابقة.'); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر تحديث الأدوار'); }
    finally { setSaving(false); }
  }

  return (
    <main className="management-page">
      <header className="management-header">
        <div>
          <a href="/">
            <ArrowRight size={17} /> العودة للوحة الإدارة
          </a>
          <h1>إدارة المستخدمين</h1>
          <p>الحسابات والأدوار والتوثيق والحظر وسجل النشاط.</p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => setFormOpen(true)}
        >
          <Plus size={18} /> إضافة مستخدم
        </button>
      </header>
      {message ? (
        <div className="notice success">
          <CheckCircle2 size={18} />
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="notice error">
          <Ban size={18} />
          {error}
        </div>
      ) : null}
      <section className="mini-stats">
        <div>
          <strong>{users.length}</strong>
          <span>إجمالي الحسابات</span>
        </div>
        <div>
          <strong>
            {users.filter((user) => user.status === "Active").length}
          </strong>
          <span>حسابات نشطة</span>
        </div>
        <div>
          <strong>{users.filter((user) => !user.phoneVerified).length}</strong>
          <span>بانتظار التوثيق</span>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header toolbar">
          <label className="admin-search">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث بالاسم أو الهاتف أو الدور"
            />
          </label>
          <span className="table-count">{filtered.length} حساب</span>
        </div>
        {loading ? (
          <div className="loading-state">
            <LoaderCircle className="spin" size={24} /> جارٍ تحميل المستخدمين...
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <Users size={35} />
            <h3>لا توجد حسابات بعد</h3>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>المستخدم</th>
                  <th>الدور</th>
                  <th>الحالة</th>
                  <th>الهاتف</th>
                  <th>النشاط</th>
                  <th>تاريخ التسجيل</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.fullName || "بدون اسم"}</strong>
                      <small dir="ltr">{user.phone}</small>
                    </td>
                    <td>
                      {user.roles
                        .map((role) => roleLabels[role] ?? role)
                        .join("، ")}
                    </td>
                    <td>
                      <span
                        className={`status-chip status-${user.status.toLowerCase()}`}
                      >
                        {statusLabels[user.status] ?? user.status}
                      </span>
                    </td>
                    <td>
                      {user.phoneVerified ? (
                        <span className="verified-user">
                          <ShieldCheck size={14} /> موثق
                        </span>
                      ) : (
                        "غير موثق"
                      )}
                    </td>
                    <td>
                      {user.activity.bids} مزايدة ·{" "}
                      {user.activity.inspectionRequests} فحص
                    </td>
                    <td>
                      {new Date(user.createdAt).toLocaleDateString("ar-LY")}
                    </td>
                    <td>
                      <div className="row-actions">
                        <a href={`/users/${user.id}`} title="عرض التفاصيل"><Eye size={16} /></a>
                        {roles.length > 0 && !user.roles.includes('SUPER_ADMIN') && <button title="تعديل الأدوار" onClick={() => { setEditingRoles(user); setSelectedRoles(user.roles); }}><KeyRound size={16} /></button>}
                        {!user.phoneVerified ? (
                          <button
                            className="publish"
                            title="توثيق الهاتف"
                            onClick={() =>
                              void updateUser(
                                user.id,
                                { phoneVerified: true, status: "Active" },
                                "تم توثيق الحساب.",
                              )
                            }
                          >
                            <UserCheck size={16} />
                          </button>
                        ) : null}
                        {user.status === "Suspended" ||
                        user.status === "Banned" ? (
                          <button
                            className="publish"
                            title="إعادة التفعيل"
                            onClick={() =>
                              void updateUser(
                                user.id,
                                { status: "Active" },
                                "تم تفعيل الحساب.",
                              )
                            }
                          >
                            <CheckCircle2 size={16} />
                          </button>
                        ) : (
                          <button
                            title="إيقاف الحساب"
                            onClick={() =>
                              void updateUser(
                                user.id,
                                { status: "Suspended" },
                                "تم إيقاف الحساب.",
                              )
                            }
                          >
                            <Ban size={16} />
                          </button>
                        )}
                        <button
                          className="archive"
                          title="أرشفة"
                          onClick={() => void archiveUser(user.id)}
                        >
                          <Archive size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {formOpen ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setFormOpen(false)
          }
        >
          <form className="vehicle-form user-form" onSubmit={createUser}>
            <div className="form-header">
              <div>
                <p>إدارة الحسابات</p>
                <h2>إضافة مستخدم</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                title="إغلاق"
                onClick={() => setFormOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="form-grid">
              <label className="form-field">
                <span>الاسم الكامل *</span>
                <input
                  required
                  value={form.fullName}
                  onChange={(event) =>
                    setForm({ ...form, fullName: event.target.value })
                  }
                />
              </label>
              <label className="form-field">
                <span>رقم الهاتف *</span>
                <input
                  required
                  dir="ltr"
                  placeholder="0912345678"
                  value={form.phone}
                  onChange={(event) =>
                    setForm({ ...form, phone: event.target.value })
                  }
                />
              </label>
              <label className="form-field">
                <span>كلمة المرور المؤقتة *</span>
                <input
                  required
                  minLength={8}
                  type="password"
                  value={form.password}
                  onChange={(event) =>
                    setForm({ ...form, password: event.target.value })
                  }
                />
              </label>
              <label className="form-field">
                <span>الدور *</span>
                <select
                  disabled={!roles.length}
                  value={form.role}
                  onChange={(event) =>
                    setForm({ ...form, role: event.target.value })
                  }
                >
                  {(roles.length ? roles : [{ code: 'CUSTOMER', name: 'مستخدم' }]).map((role) => (
                    <option value={role.code} key={role.code}>
                      {roleLabels[role.code] ?? role.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-note">
              الحساب يبدأ بانتظار توثيق الهاتف ويمكن للإدارة توثيقه من الجدول.
            </div>
            <div className="form-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setFormOpen(false)}
              >
                إلغاء
              </button>
              <button
                className="primary-button"
                disabled={saving}
                type="submit"
              >
                {saving ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <Save size={18} />
                )}{" "}
                إنشاء الحساب
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {editingRoles && <div className="modal-backdrop"><form className="vehicle-form user-form" onSubmit={saveRoles}>
        <div className="form-header"><h2>أدوار {editingRoles.fullName || editingRoles.phone}</h2><button className="icon-button" type="button" title="إغلاق" onClick={() => setEditingRoles(null)}><X size={20} /></button></div>
        <div className="form-grid">{roles.map((role) => <label key={role.code} className="form-field"><span><input type="checkbox" checked={selectedRoles.includes(role.code)} disabled={saving || (!selectedRoles.includes(role.code) && selectedRoles.length >= 5)} onChange={(event) => setSelectedRoles((current) => event.target.checked ? [...current, role.code] : current.filter((code) => code !== role.code))} /> {roleLabels[role.code] ?? role.name}</span></label>)}</div>
        {error && <p className="notice error" role="alert">{error}</p>}
        <button className="primary-button" disabled={saving} type="submit">{saving ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />} حفظ الأدوار</button>
      </form></div>}
    </main>
  );
}
