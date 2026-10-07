'use client';

import { useParams } from 'next/navigation';
import {
  ArrowRight,
  CarFront,
  Clock3,
  Gavel,
  Radio,
  ShieldCheck,
  TrendingUp,
  Users,
  Wrench,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { mediaUrl } from '../../../lib/media';
import SaveControls from '../../components/save-controls';

type Auction = {
  id: string;
  description: string | null;
  status: string;
  startsAt: string;
  endsAt: string;
  rollingRound: boolean;
  roundSeconds: number;
  currentBidLyd: number;
  nextBidLyd: number;
  bidIncrementLyd: number;
  bidCount: number;
  reserveMet: boolean | null;
  costs: {
    buyerFeeLyd: number;
    depositLyd: number;
    dueNowLyd: number;
    remainingLyd: number;
    totalLyd: number;
    paymentDeadlineMinutes: number;
  };
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    category: string;
    condition: string;
    mileageKm: number | null;
    city: string | null;
    imageUrl: string | null;
    lotNumber: string;
    dealer: { name: string } | null;
  };
  recentBids: { id: string; bidder: string; amountLyd: number; createdAt: string }[];
};
type Participation = { isLeading: boolean; isOutbid: boolean; isSeller: boolean; canCancel: boolean;
  balanceLyd: number; requiredBalanceLyd: number; walletEligible: boolean; canBid: boolean };

const money = (value: number) => `${value.toLocaleString('ar-LY', { maximumFractionDigits: 3 })} د.ل`;
const errors: Record<string, string> = {
  'auction.bidder_not_eligible': 'يتطلب المزاد حساباً نشطاً ورقم هاتف موثقاً.',
  'bid.below_minimum_increment': 'تغير السعر. راجع المزايدة التالية.',
  'bid.concurrent_update': 'وصلت مزايدة أخرى. راجع السعر الحالي.',
  'auction.ended': 'انتهى المزاد.',
  'auction.owner_cannot_bid': 'لا يمكنك المزايدة على سيارة مرتبطة بحسابك.',
  'auction.section_closed': 'قسم المزاد مغلق حالياً.',
  'auction.wallet_balance_required': 'رصيد المحفظة أقل من حد أهلية المزايدة.',
  'auction.wallet_balance_changed': 'تغير رصيد محفظتك أثناء المزايدة. تحقق منه وأعد المحاولة.',
  'auction.cannot_cancel_result': 'لا يمكن إلغاء هذا المزاد بعد إعلان فائز.',
  'auth.permission_denied': 'الحساب لا يملك صلاحية المزايدة.',
};

const categoryLabels: Record<string, string> = { Car: 'سيارة', Truck: 'شاحنة', Motorcycle: 'دراجة نارية', Bicycle: 'دراجة هوائية', Other: 'أخرى' };
const conditionLabels: Record<string, string> = { New: 'جديدة', Used: 'مستعملة', Excellent: 'ممتازة', Accident: 'تعرضت لحادث', NeedsRepair: 'تحتاج إصلاح', Runs: 'تعمل', NotRunning: 'لا تعمل' };

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    Live: 'مباشر',
    Scheduled: 'مجدول',
    Paused: 'متوقف مؤقتاً',
    PaymentPending: 'بانتظار العربون',
    Sold: 'مباع',
    Cancelled: 'ملغي',
    NoWinner: 'بدون فائز',
  };
  return labels[status] ?? 'منتهي';
}

export default function LiveAuctionPage() {
  const { id } = useParams<{ id: string }>();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [participation, setParticipation] = useState<Participation | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());
  const [connected, setConnected] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const pending = useRef<{ amountLyd: string; idempotencyKey: string } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/platform/auctions/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('تعذر تحميل المزاد');
    setAuction(await response.json());
    const mine = await fetch(`/api/platform/auctions/${encodeURIComponent(id)}/me`, { cache: 'no-store' });
    if (mine.ok) setParticipation(await mine.json());
    else setParticipation(null);
  }, [id]);

  useEffect(() => {
    void load().catch((caught: Error) => setError(caught.message));
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => void load().catch(() => {}), 15000);
    const socket = io(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100'}/auctions`, { withCredentials: true });
    socket.on('connect', () => {
      setConnected(true);
      socket.emit('auction:join', { auctionId: id });
      void load();
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('auction:bid-accepted', () => void load());
    socket.on('auction:status-changed', () => void load());
    return () => {
      clearInterval(clock);
      clearInterval(poll);
      socket.disconnect();
    };
  }, [id, load]);

  async function prepare() {
    const response = await fetch('/api/auth/me');
    const session = response.ok ? await response.json() : null;
    if (!session || session.mode === 'guest') {
      location.href = `/auth?returnTo=${encodeURIComponent(`/auctions/${id}`)}`;
      return;
    }
    setError('');
    setNotice('');
    pending.current = null;
    setConfirming(true);
  }

  async function bid() {
    if (!auction || sending) return;
    setSending(true);
    setError('');
    pending.current ??= { amountLyd: String(auction.nextBidLyd), idempotencyKey: crypto.randomUUID() };
    try {
      const response = await fetch(`/api/platform/auctions/${id}/bids`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(pending.current),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status < 500) pending.current = null;
        throw new Error(errors[body.message] ?? 'تعذر قبول المزايدة. راجع السعر وحالة حسابك.');
      }
      pending.current = null;
      setConfirming(false);
      setNotice('تم قبول مزايدتك وحفظها.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'انقطع الاتصال. أعد المحاولة للتحقق من نفس المزايدة.');
    } finally {
      setSending(false);
    }
  }

  async function cancelNoWinner() {
    if (!confirm('إلغاء المزاد الذي انتهى بدون فائز؟ سيبقى سجل المزايدات محفوظًا.')) return;
    setSending(true); setError('');
    try {
      const response = await fetch(`/api/platform/auctions/${id}/cancel`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(errors[body.message] ?? 'تعذر إلغاء المزاد.');
      setNotice('أُلغي المزاد وحُفظ سجل المزايدات.');
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر إلغاء المزاد'); }
    finally { setSending(false); }
  }

  if (!auction) {
    return <main className="market-page"><a href="/auctions">العودة للمزادات</a><p>{error || 'جارٍ تحميل المزاد...'}</p></main>;
  }

  const seconds = Math.max(0, Math.ceil((new Date(auction.endsAt).getTime() - now) / 1000));
  const timer = `${Math.floor(seconds / 3600).toString().padStart(2, '0')}:${Math.floor(seconds % 3600 / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  const canBid = auction.status === 'Live' && seconds > 0 && !sending && (!participation || participation.canBid);
  const roundSpan = auction.rollingRound ? auction.roundSeconds : Math.max(120, (new Date(auction.endsAt).getTime() - new Date(auction.startsAt).getTime()) / 1000);
  const ringProgress = Math.max(0, Math.min(100, seconds / roundSpan * 100));
  const ringColor = participation?.isLeading ? '#218653' : participation?.isOutbid ? '#c0323c' : '#1769d2';

  return <main className="market-page live-market-page">
    <header className="market-heading live-market-heading">
      <a href="/auctions"><ArrowRight size={18} /> المزادات</a>
      <div><small>مزاد سيارة مباشر</small><h1>{auction.vehicle.make} {auction.vehicle.model} {auction.vehicle.year}</h1></div>
      <span className={connected ? 'socket-state online' : 'socket-state'}><Radio size={15} />{connected ? 'متصل مباشرة' : 'تحديث دوري'}</span>
    </header>

    <section className="auction-command-bar" aria-label="حالة المزاد والمزايدة">
      <div className={`command-status ${auction.status === 'Live' ? 'is-live' : ''}`}>
        <span className="live-pulse" />
        <small>الحالة</small>
        <strong>{statusLabel(auction.status)}</strong>
      </div>
      <div className="command-metric primary"><TrendingUp size={19} /><span><small>السعر الحالي</small><strong className="live-bid-value" key={auction.currentBidLyd}>{money(auction.currentBidLyd)}</strong></span></div>
      <div className="command-metric"><Gavel size={19} /><span><small>المزايدة التالية</small><strong>{money(auction.nextBidLyd)}</strong></span></div>
      <div className={`command-metric countdown ${seconds < 120 ? 'ending' : ''}`}><Clock3 size={19} /><span><small>الوقت المتبقي</small><strong dir="ltr">{timer}</strong></span></div>
      <button className="command-bid" disabled={!canBid} onClick={() => void prepare()}><Gavel size={21} /><span>زايد الآن</span><strong>{money(auction.nextBidLyd)}</strong></button>
    </section>

    <div className="live-auction-layout">
      <section className="live-auction-vehicle">
        <div className="live-vehicle-image">{auction.vehicle.imageUrl
          ? <img src={mediaUrl(auction.vehicle.imageUrl)} alt={`${auction.vehicle.make} ${auction.vehicle.model}`} />
          : <div><CarFront size={64} /><p>لم تُضف صور السيارة بعد</p></div>}
        </div>
        <div className="live-vehicle-meta">
          <span>رقم السيارة <b dir="ltr">{auction.vehicle.lotNumber}</b></span>
          <span>{auction.vehicle.city ?? 'المدينة غير محددة'}</span>
          <span>{auction.vehicle.dealer?.name ?? 'إدراج المنصة'}</span>
        </div>
        {auction.description && <div className="auction-description"><h2>وصف المزاد</h2><p>{auction.description}</p></div>}
        <details className="auction-extra-details"><summary>تفاصيل إضافية</summary><dl><div><dt>بداية المزاد</dt><dd>{new Date(auction.startsAt).toLocaleString('ar-LY')}</dd></div><div><dt>رقم العرض</dt><dd dir="ltr">{auction.vehicle.lotNumber}</dd></div><div><dt>التصنيف</dt><dd>{categoryLabels[auction.vehicle.category] ?? auction.vehicle.category}</dd></div><div><dt>الحالة</dt><dd>{conditionLabels[auction.vehicle.condition] ?? auction.vehicle.condition}</dd></div>{auction.vehicle.mileageKm != null && <div><dt>المسافة</dt><dd>{auction.vehicle.mileageKm.toLocaleString('ar-LY')} كم</dd></div>}</dl></details>
        <div className="auction-utility-row">
          <a className="inspection-link" href="/technicians"><Wrench size={17} /> اطلب فحص السيارة</a>
          <span><Users size={16} /> {auction.bidCount} مزايدة</span>
          <span><Gavel size={16} /> الزيادة {money(auction.bidIncrementLyd)}</span>
        </div>
        <h2 className="compact-title">آخر المزايدات</h2>
        <div className="bid-history">
          {!auction.recentBids.length && <p>لم تُسجل مزايدات بعد</p>}
          {auction.recentBids.map((item) => <div key={item.id}><span dir="ltr">{item.bidder}</span><strong>{money(item.amountLyd)}</strong><time>{new Date(item.createdAt).toLocaleTimeString('ar-LY')}</time></div>)}
        </div>
      </section>

      <aside className="bidding-panel">
        <div className="bidding-panel-top"><strong>ملخص التكلفة عند الفوز</strong><span>{auction.bidCount} مزايدة</span></div>
        <div className="auction-round-status">
          <div className="auction-round-ring" style={{ background: `conic-gradient(${ringColor} ${ringProgress}%, #e2eaf3 0)` }}>
            <div><strong dir="ltr">{timer}</strong><small>{participation?.isLeading ? 'مزايدتك هي الأعلى' : participation?.isOutbid ? 'تم تجاوز مزايدتك' : auction.rollingRound ? 'جولة سريعة' : statusLabel(auction.status)}</small></div>
          </div>
          <span>الوقت المتبقي{auction.rollingRound ? ' · يتجدد بعد كل مزايدة' : ''}</span>
        </div>
        <div className="panel-price-focus"><small>المزايدة التالية الملزمة</small><strong>{money(auction.nextBidLyd)}</strong></div>
        <span className="reserve-state"><ShieldCheck size={15} />{auction.reserveMet === null ? 'بدون سعر احتياطي' : auction.reserveMet ? 'تحقق السعر الاحتياطي' : 'لم يتحقق السعر الاحتياطي'}</span>
        <dl className="auction-costs">
          <div><dt>السعر الحالي</dt><dd>{money(auction.currentBidLyd)}</dd></div>
          <div><dt>رسوم الشراء</dt><dd>{money(auction.costs.buyerFeeLyd)}</dd></div>
          <div className="total"><dt>إجمالي الشراء</dt><dd>{money(auction.costs.totalLyd)}</dd></div>
          <div><dt>العربون والرسوم بعد الفوز</dt><dd>{money(auction.costs.dueNowLyd)}</dd></div>
          <div><dt>المتبقي بعد العربون</dt><dd>{money(auction.costs.remainingLyd)}</dd></div>
        </dl>
        <p className="payment-deadline">مهلة دفع العربون: {auction.costs.paymentDeadlineMinutes} دقيقة من تأكيد الفوز.</p>
        <SaveControls vehicleId={auction.vehicle.id} auctionId={auction.id} />
        {participation && <div className="auction-wallet-eligibility"><span>رصيد المحفظة: <strong>{money(participation.balanceLyd)}</strong></span><span>رصيد الأهلية المطلوب: <strong>{money(participation.requiredBalanceLyd)}</strong></span><small>هذا تأمين للأهلية فقط ولا يُخصم عند المزايدة. يمكنك طلب استرداده بعد نهاية المزاد وتسوية الالتزامات. رسوم الشراء والعربون منفصلان.</small><a href="/workspace?tab=wallet">{participation.walletEligible ? 'المحفظة' : 'شحن الرصيد المطلوب'}</a><a href={`/workspace?tab=requests&action=inspection&vehicleId=${auction.vehicle.id}`}>طلب فحص المركبة</a></div>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        {notice && <p className="bid-success" role="status">{notice}</p>}
        {participation?.isSeller ? <>{participation.canCancel && <button className="auth-submit panel-bid-button" disabled={sending} onClick={() => void cancelNoWinner()}>إلغاء المزاد بدون فائز</button>}<small className="binding-bid-note">هذا مزاد سيارتك. تظهر لك المزايدات لحظيًا ولا يمكنك المزايدة عليها.</small></> : <button className="auth-submit panel-bid-button" disabled={!canBid} onClick={() => void prepare()}><Gavel size={20} /> زايد بـ {money(auction.nextBidLyd)}</button>}
        <small className="binding-bid-note">المزايدة ملزمة وفق شروط المزاد، وستظهر لك جميع الرسوم قبل التأكيد.</small>
      </aside>
    </div>

    {confirming && <div className="bid-confirm-backdrop"><section role="dialog" aria-modal="true" aria-label="تأكيد المزايدة" className="bid-confirm">
      <Gavel size={28} /><h2>تأكيد المزايدة</h2>
      <p>أنت على وشك المزايدة بمبلغ <strong>{money(Number(pending.current?.amountLyd ?? auction.nextBidLyd))}</strong>.</p>
      <p>هذه المزايدة ملزمة وفق شروط المزاد.</p>
      <div className="confirm-cost"><span>إجمالي الشراء المتوقع</span><strong>{money(auction.costs.totalLyd)}</strong></div>
      {error && <p className="auth-error">{error}</p>}
      <button className="auth-submit" disabled={sending} onClick={() => void bid()}>{sending ? 'جارٍ الإرسال...' : pending.current ? 'التحقق وإعادة المحاولة' : 'تأكيد المزايدة'}</button>
      <button className="guest-button" disabled={sending} onClick={() => setConfirming(false)}>إلغاء</button>
    </section></div>}
  </main>;
}
