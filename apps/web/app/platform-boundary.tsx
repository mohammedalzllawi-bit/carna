'use client';
import { ReactNode, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { LoaderCircle, Wrench } from 'lucide-react';

export default function PlatformBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<'loading' | 'ready' | 'maintenance' | 'error'>('loading');
  useEffect(() => {
    if (pathname === '/auth') { setState('ready'); return; }
    let cancelled = false;
    const check = async () => {
      const response = await fetch('/api/platform/settings/public', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const settings = await response.json();
      if (cancelled) return;
      if (settings['platform.maintenance_mode']) { setState('maintenance'); return; }
      if (!settings['platform.guest_mode_enabled']) {
        const session = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!session.ok || (await session.json()).mode === 'guest') { window.location.href = `/auth?returnTo=${encodeURIComponent(pathname)}`; return; }
      }
      setState('ready');
    };
    void check().catch(() => !cancelled && setState('error'));
    const timer = setInterval(() => void check().catch(() => {}), 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [pathname]);
  if (state === 'ready') return children;
  return <main className="account-state">{state === 'loading' ? <LoaderCircle className="spin" /> : <Wrench size={36} />}<h1>{state === 'maintenance' ? 'المنصة تحت الصيانة' : state === 'error' ? 'تعذر الاتصال بالمنصة' : 'جارٍ التحميل'}</h1>{state !== 'loading' ? <button className="auth-submit" onClick={() => window.location.reload()}>إعادة المحاولة</button> : null}</main>;
}
