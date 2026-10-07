import { notFound } from 'next/navigation';
export default async function ContentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!['terms', 'privacy', 'auction-rules', 'consumer-protection'].includes(slug)) notFound();
  const response = await fetch(`${process.env.API_URL ?? 'http://localhost:4100'}/v1/content/${slug}`, { cache: 'no-store' });
  if (response.status === 404) return <main className="account-page"><a href="/">السوق</a><h1>الصفحة غير منشورة بعد</h1></main>;
  if (!response.ok) return <main className="account-page"><h1>تعذر تحميل الصفحة حالياً</h1></main>;
  const page = await response.json() as { title: string; body: string; updatedAt: string };
  return <main className="account-page"><a href="/">السوق</a><h1>{page.title}</h1><time>{new Date(page.updatedAt).toLocaleDateString('ar-LY')}</time><div className="policy-body">{page.body}</div></main>;
}
