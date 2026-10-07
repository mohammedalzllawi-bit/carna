'use client';

import { ArrowRight, CarFront, Eye, EyeOff, LoaderCircle, LogIn, UserPlus } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';

const errorMessages: Record<string, string> = {
  'auth.invalid_credentials': 'رقم الهاتف أو كلمة المرور غير صحيحة.',
  'auth.phone_already_registered': 'رقم الهاتف مسجل مسبقاً.',
  'auth.account_unavailable': 'هذا الحساب غير متاح حالياً.',
};

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [guestEnabled, setGuestEnabled] = useState(false);
  useEffect(() => { fetch('/api/platform/settings/public').then((r) => r.json()).then((s) => setGuestEnabled(s['platform.guest_mode_enabled'] === true)).catch(() => {}); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(values),
      });
      const data = await response.json() as { message?: string | string[]; user?: { roles?: string[] } };
      if (!response.ok) {
        const code = Array.isArray(data.message) ? data.message[0] : data.message;
        throw new Error((code && errorMessages[code]) || 'تعذر إتمام العملية. تحقق من البيانات.');
      }
      const returnTo = new URLSearchParams(location.search).get('returnTo');
      window.location.href = returnTo?.startsWith('/') && !returnTo.startsWith('//') && !returnTo.includes('\\')
        ? returnTo
        : data.user?.roles?.includes('DEALER_OWNER') ? '/dealer' : '/account';
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر الاتصال بالخادم.'); }
    finally { setLoading(false); }
  }

  async function continueAsGuest() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/auth/guest', { method: 'POST' });
      if (!response.ok) throw new Error('تعذر بدء جلسة الضيف.');
      window.location.href = '/';
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر الاتصال بالخادم.'); setLoading(false); }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <a className="auth-back" href="/"><ArrowRight size={17} /> العودة للسوق</a>
        <div className="auth-brand"><span><CarFront size={25} /></span><div><strong>سوق بنغازي</strong><small>حساب المستخدم</small></div></div>
        <div className="auth-tabs" role="tablist"><button className={mode === 'login' ? 'active' : ''} type="button" onClick={() => { setMode('login'); setError(''); }}>تسجيل الدخول</button><button className={mode === 'register' ? 'active' : ''} type="button" onClick={() => { setMode('register'); setError(''); }}>حساب جديد</button></div>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' ? <label><span>الاسم الكامل</span><input required name="fullName" autoComplete="name" maxLength={100} /></label> : null}
          <label><span>رقم الهاتف الليبي</span><input required name="phone" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="0912345678" /></label>
          <label><span>كلمة المرور</span><span className="password-input"><input required name="password" minLength={mode === 'register' ? 8 : 1} maxLength={72} type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /><button type="button" title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
          {error ? <div className="auth-error" role="alert">{error}</div> : null}
          <button className="auth-submit" disabled={loading} type="submit">{loading ? <LoaderCircle className="spin" size={19} /> : mode === 'login' ? <LogIn size={19} /> : <UserPlus size={19} />}{mode === 'login' ? 'دخول' : 'إنشاء الحساب'}</button>
        </form>
        <div className="auth-divider"><span>أو</span></div>
        {guestEnabled && <button className="guest-button" disabled={loading} type="button" onClick={() => void continueAsGuest()}>متابعة كضيف</button>}
        <p className="guest-note">يمكن للضيف التصفح فقط. المزايدة والفحص والدفع تتطلب حساباً موثقاً.</p>
      </section>
      <aside className="auth-context"><div><span>سوق سيارات بنغازي</span><h1>اعرف التكلفة والحالة قبل أن تلتزم.</h1><p>حساب واحد لمتابعة السيارات والمزادات وطلبات الفحص والمدفوعات.</p></div></aside>
    </main>
  );
}
