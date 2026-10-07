import { saveAdminSession } from '../../../../lib/admin-session';

const apiUrl = process.env.API_URL ?? 'http://localhost:4100';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.phone !== 'string' || typeof body.password !== 'string') {
    return Response.json({ message: 'أدخل رقم الهاتف وكلمة المرور.' }, { status: 400 });
  }
  try {
    const response = await fetch(`${apiUrl}/v1/auth/login`, {
      method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: body.phone, password: body.password }),
    });
    if (!response.ok) return Response.json({ message: 'تعذر الدخول. تحقق من بياناتك أو انتظر قبل إعادة المحاولة.' }, { status: response.status });
    const auth = await response.json();
    const profile = await fetch(`${apiUrl}/v1/auth/me`, { cache: 'no-store', headers: { authorization: `Bearer ${auth.accessToken}` } });
    const user = profile.ok ? await profile.json() : null;
    if (!user?.permissions?.includes('admin.access')) {
      await fetch(`${apiUrl}/v1/auth/logout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: auth.refreshToken }) });
      return Response.json({ message: 'الحساب لا يملك صلاحية دخول الإدارة.' }, { status: 403 });
    }
    await saveAdminSession(auth);
    return Response.json({ user });
  } catch { return Response.json({ message: 'تعذر الاتصال بالخادم.' }, { status: 503 }); }
}
