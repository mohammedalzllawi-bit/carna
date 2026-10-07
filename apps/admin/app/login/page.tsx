'use client';

import { Gavel, KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react';
import { FormEvent, useState } from 'react';

export default function AdminLoginPage() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin-session/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, password }),
      });
      if (!response.headers.get('content-type')?.includes('json')) {
        throw new Error(`خادم الإدارة غير جاهز. أعد تحميل الصفحة (${response.status}).`);
      }
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message || 'تعذر تسجيل الدخول');
      window.location.href = '/';
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="admin-login-page">
      <section className="admin-login-panel">
        <span className="admin-login-mark"><Gavel size={28} /></span>
        <p className="admin-login-kicker"><ShieldCheck size={15} /> منطقة إدارية محمية</p>
        <h1>دخول لوحة الإدارة</h1>
        <p className="admin-login-copy">سوق بنغازي للسيارات</p>
        <form onSubmit={submit}>
          <label>
            <span>رقم الهاتف</span>
            <span className="admin-key-input"><input autoFocus required type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="username" dir="ltr" /></span>
          </label>
          <label>
            <span>كلمة المرور</span>
            <span className="admin-key-input"><KeyRound size={18} /><input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></span>
          </label>
          {error ? <div className="admin-login-error">{error}</div> : null}
          <button className="primary-button" disabled={loading} type="submit">{loading ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />} دخول آمن</button>
        </form>
      </section>
    </main>
  );
}
