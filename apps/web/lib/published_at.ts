const locale = 'ar-LY-u-nu-latn';
const dayMonth = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' });
const dayMonthYear = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' });
const fullDate = new Intl.DateTimeFormat(locale, {
  day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
});

function parsePublishedAt(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function publishedDateRelative(value?: string | null, now = new Date()): string | null {
  const date = parsePublishedAt(value);
  if (!date) return null;
  const ageMs = Math.max(0, now.getTime() - date.getTime());
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return 'الآن';
  if (minutes < 60) {
    if (minutes === 1) return 'منذ دقيقة';
    if (minutes === 2) return 'منذ دقيقتين';
    return `منذ ${minutes} ${minutes <= 10 ? 'دقائق' : 'دقيقة'}`;
  }
  const hours = Math.floor(ageMs / 3_600_000);
  if (hours < 24) {
    if (hours === 1) return 'منذ ساعة';
    if (hours === 2) return 'منذ ساعتين';
    return `منذ ${hours} ${hours <= 10 ? 'ساعات' : 'ساعة'}`;
  }
  const days = Math.floor(ageMs / 86_400_000);
  if (days < 10) {
    if (days === 1) return 'منذ يوم';
    if (days === 2) return 'منذ يومين';
    return `منذ ${days} أيام`;
  }
  return `منذ ${(date.getFullYear() === now.getFullYear() ? dayMonth : dayMonthYear).format(date)}`;
}

export function publishedDateDetailed(value?: string | null): string | null {
  const date = parsePublishedAt(value);
  return date ? fullDate.format(date) : null;
}
