'use client';

import { ArrowRight, Building2, CarFront, Gavel, LoaderCircle, LogOut, ShieldCheck, UserRound, MessageCircle, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';

type Session = { id?: string; phone?: string | null; fullName?: string | null; status?: string; roles?: string[]; mode?: 'guest' };
type Order = { id: string; type: string; status: string; totalLyd: number; feesLyd: number; subtotalLyd: number; expiresAt: string | null; referenceId: string | null };
type Ledger = { accounts: { currency: string; balanceLyd: number }[]; entries: { id: string; amountLyd: number; direction: string; type: string; createdAt: string }[] };

export default function AccountPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<{ bids: number; wins: number; inspections: number; favorites: number } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [wallet, setWallet] = useState<Ledger | null>(null);
  const [providers, setProviders] = useState<{ code: string; name: string }[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() as Promise<Session> : null)
      .then(async (data) => {
        setSession(data);
        if (!data?.id) return;
        const paths = ['account/summary', 'payments/orders', 'wallet', 'payments/providers'];
        const results = await Promise.all(paths.map(async (path) => { const response = await fetch(`/api/platform/${path}`); if (!response.ok) throw new Error('تعذر تحميل بيانات الحساب'); return response.json(); }));
        setCounts(results[0]); setOrders(results[1]); setWallet(results[2]); setProviders(results[3]);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/auth';
  }
  async function pay(order: Order) {
    const provider = providers[0]; if (!provider) return;
    const response = await fetch('/api/platform/payments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId: order.id, provider: provider.code, idempotencyKey: crypto.randomUUID() }) });
    const result = await response.json();
    if (!response.ok) { setError('تعذر بدء الدفع. راجع حالة الطلب قبل إعادة المحاولة.'); return; }
    if (typeof result.checkoutUrl === 'string' && result.checkoutUrl.startsWith('https://')) location.href = result.checkoutUrl;
  }

  if (loading) return <main className="account-state"><LoaderCircle className="spin" size={25} /> جارٍ تحميل الحساب...</main>;
  if (!session) return <main className="account-state"><UserRound size={38} /><h1>لم تسجل الدخول</h1><a className="auth-submit" href="/auth">الدخول أو إنشاء حساب</a></main>;
  if (session.mode === 'guest') return <main className="account-state"><CarFront size={38} /><h1>أنت تتصفح كضيف</h1><p>أنشئ حساباً للمزايدة وطلب الفحص وحفظ السيارات.</p><a className="auth-submit" href="/auth">إنشاء حساب</a><a className="auth-back" href="/"><ArrowRight size={16} /> العودة للسوق</a></main>;

  return (
    <main className="account-page">
      <header className="account-header"><a href="/"><ArrowRight size={17} /> العودة للسوق</a><button type="button" onClick={() => void logout()}><LogOut size={17} /> تسجيل الخروج</button></header>
      <section className="account-profile"><span className="account-avatar"><UserRound size={31} /></span><div><small>مرحباً</small><h1>{session.fullName}</h1><p dir="ltr">{session.phone}</p></div><span className="account-status"><ShieldCheck size={16} />{session.status === 'Active' ? 'حساب نشط' : 'بانتظار توثيق الهاتف'}</span></section>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <section className="account-grid"><article><strong>{counts?.bids ?? '-'}</strong><span>مزايداتي</span></article><article><strong>{counts?.wins ?? '-'}</strong><span>السيارات الفائزة</span></article><article><strong>{counts?.inspections ?? '-'}</strong><span>طلبات الفحص</span></article><article><strong>{counts?.favorites ?? '-'}</strong><span>المفضلة</span></article></section>
      <div className="account-actions"><a href="/sell"><Plus size={18} /><span><strong>إعلاناتي وبيع مركبة</strong><small>بيع مباشر أو إكمال مسودة</small></span></a><a href="/messages"><MessageCircle size={18} /><span><strong>الرسائل</strong><small>محادثات العروض</small></span></a><a href="/sell/auction"><Gavel size={18} /><span><strong>أضف مركبتك إلى المزاد</strong><small>اعرف الرسوم وأرسل طلبك للمراجعة</small></span></a>{session.roles?.includes('DEALER_OWNER') && <a href="/dealer"><Building2 size={18} /><span><strong>واجهة المعرض</strong><small>الاشتراك والسيارات والتقييمات</small></span></a>}</div>
      <a className="auth-back" href="/notifications">الإشعارات</a>
      <nav className="workspace-actions"><a href="/workspace?tab=wallet">المحفظة</a><a href="/workspace?tab=subscriptions">اشتراكات النشر</a><a href="/workspace?tab=requests">{session.roles?.includes('TECHNICIAN') ? 'واجهة الفني والطلبات' : 'طلبات الشراء والفحص'}</a><a href="/workspace?tab=favorites">المفضلة</a><a href="/workspace?tab=settings">إعدادات الحساب</a></nav>
      <h2 className="compact-title">المشتريات والعربونات</h2>
      {!orders.length && <p>لا توجد طلبات شراء بعد.</p>}
      {orders.map((order) => <article className="account-order" key={order.id}><div><h3>{order.type === 'AuctionDeposit' ? 'عربون المزاد' : order.type}</h3><span>{order.status}</span><p>العربون: {order.subtotalLyd.toLocaleString('ar-LY')} د.ل · الرسوم: {order.feesLyd.toLocaleString('ar-LY')} د.ل</p>{order.expiresAt && <small>المهلة: {new Date(order.expiresAt).toLocaleString('ar-LY')}</small>}</div><div><strong>{order.totalLyd.toLocaleString('ar-LY')} د.ل</strong>{order.status === 'PaymentPending' && (!order.expiresAt || new Date(order.expiresAt) > new Date()) && <button className="auth-submit" disabled={!providers.length} onClick={() => void pay(order)}>{providers.length ? `دفع عبر ${providers[0].name}` : 'الدفع الإلكتروني غير متاح حالياً'}</button>}</div></article>)}
      <h2 className="compact-title">المحفظة وسجل الحركات</h2>
      {wallet?.accounts.map((account) => <p key={account.currency}>الرصيد: <strong>{account.balanceLyd.toLocaleString('ar-LY')} {account.currency}</strong></p>)}
      {!wallet?.entries.length && <p>لا توجد حركات مالية.</p>}
      {wallet?.entries.map((entry) => <div className="account-order" key={entry.id}><span>{entry.type} · {entry.direction === 'Credit' ? 'إيداع' : 'خصم'}</span><strong>{entry.amountLyd.toLocaleString('ar-LY')} د.ل</strong><time>{new Date(entry.createdAt).toLocaleString('ar-LY')}</time></div>)}
    </main>
  );
}
