'use client';
import { Bell, BellRing, Heart } from 'lucide-react';
import { useEffect, useState } from 'react';
export default function SaveControls({ vehicleId, auctionId }: { vehicleId: string; auctionId?: string }) {
  const [favorite, setFavorite] = useState(false), [watch, setWatch] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    void fetch('/api/platform/account/favorites').then(async (r) => { if (r.ok && active) setFavorite((await r.json() as { vehicleId: string }[]).some((v) => v.vehicleId === vehicleId)); }).catch(() => {});
    if (auctionId) void fetch('/api/platform/workspace/watches').then(async (r) => { if (r.ok && active) setWatch((await r.json() as { auctionId: string }[]).some((v) => v.auctionId === auctionId)); }).catch(() => {});
    return () => { active = false; };
  }, [vehicleId, auctionId]);
  async function toggle(kind: 'favorite' | 'watch') {
    if (busy) return;
    setBusy(true); setNotice('');
    try {
      const enabled = kind === 'favorite' ? favorite : watch;
      const path = kind === 'favorite' ? `account/favorites/${vehicleId}` : `workspace/watches/${auctionId}`;
      const r = await fetch(`/api/platform/${path}`, { method: enabled ? 'DELETE' : 'POST' });
      if (r.status === 401) { location.href = `/auth?returnTo=${encodeURIComponent(location.pathname)}`; return; }
      if (!r.ok) throw new Error('تعذر حفظ الاختيار');
      if (kind === 'favorite') setFavorite(!favorite);
      else { const data = await r.json() as { reminderMinutes: number[] }; setWatch(!watch); setNotice(watch ? 'أُلغيت التذكيرات' : `التذكيرات قبل ${data.reminderMinutes.join('، ')} دقيقة، حسب تفضيلات الإشعارات.`); }
    } catch (e) { setNotice(e instanceof Error ? e.message : 'تعذر الاتصال'); }
    finally { setBusy(false); }
  }
  return <div className="save-controls"><button title={favorite ? 'إزالة من المفضلة' : 'إضافة للمفضلة'} aria-pressed={favorite} onClick={() => void toggle('favorite')} disabled={busy}><Heart size={20} fill={favorite ? 'currentColor' : 'none'} /></button>{auctionId && <button title={watch ? 'إلغاء التذكيرات' : 'تذكيري بالمزاد'} aria-pressed={watch} onClick={() => void toggle('watch')} disabled={busy}>{watch ? <BellRing size={20} /> : <Bell size={20} />}</button>}{notice && <small role="status">{notice}</small>}</div>;
}
