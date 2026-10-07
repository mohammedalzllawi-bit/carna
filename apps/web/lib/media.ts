export function mediaUrl(value: string) {
  return value.startsWith('/v1/') ? `/api/platform/${value.slice('/v1/'.length)}` : value;
}
