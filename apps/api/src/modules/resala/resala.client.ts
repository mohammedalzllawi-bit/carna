export interface ResalaConfig {
  baseUrl: string;
  token?: string;
  production: boolean;
  serviceName?: string;
  autofillHash?: string;
}

export interface ResalaPinResponse {
  id: string;
  pin: string;
  code: string;
  number: string;
  content: string;
  created_at: string;
}

export type ResalaTemplateRecord = { phone: string } & Record<string, string>;

export interface ResalaSentRow {
  id?: string;
  status: 'accepted' | 'sent' | 'delivered' | 'undelivered' | string;
  created_at?: string;
  [key: string]: unknown;
}

export interface ResalaSentView {
  data: ResalaSentRow[];
  meta: Record<string, unknown>;
}

export class ResalaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly fieldErrors?: Record<string, string[]>,
  ) { super(message); }
}

export function normalizeResalaPhone(input: string) {
  const compact = input.replace(/[\s()-]/g, '');
  const number = compact.startsWith('0') ? `218${compact.slice(1)}` : compact.replace(/^\+/, '');
  if (!/^2189\d{8}$/.test(number)) throw new ResalaApiError('Invalid Libyan mobile number', 422, { phone: ['Expected 218 followed by a nine-digit mobile number'] });
  return number;
}

function validationErrors(body: unknown): Record<string, string[]> | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const record = body as Record<string, unknown>;
  const source = record.errors && typeof record.errors === 'object' && !Array.isArray(record.errors)
    ? record.errors as Record<string, unknown> : record;
  const entries = Object.entries(source).filter(([key, value]) => key !== 'message' && key !== 'status' &&
    (typeof value === 'string' || Array.isArray(value)));
  if (!entries.length) return undefined;
  return Object.fromEntries(entries.map(([key, value]) => [key, Array.isArray(value) ? value.map(String) : [String(value)]]));
}

export class ResalaClient {
  private readonly baseUrl: string;

  constructor(
    private readonly config: ResalaConfig,
    private readonly http: typeof fetch = globalThis.fetch,
    private readonly sleep: (milliseconds: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    if (!this.baseUrl.startsWith('https://')) throw new Error('RESALA_BASE_URL must use HTTPS');
    if (config.autofillHash && config.autofillHash.length > 32) throw new Error('RESALA_AUTOFILL_HASH must not exceed 32 characters');
  }

  ensureConfigured() {
    if (!this.config.token) throw new ResalaApiError('Check RESALA_API_TOKEN: it is not configured', 503);
  }

  async sendPin(phone: string, options: { len?: 4 | 5 | 6; serviceName?: string; autofillHash?: string } = {}) {
    const number = normalizeResalaPhone(phone);
    const length = options.len ?? 6;
    if (![4, 5, 6].includes(length)) throw new ResalaApiError('OTP length must be 4, 5 or 6', 422);
    const query = new URLSearchParams();
    query.set('len', String(length));
    if (options.serviceName ?? this.config.serviceName) query.set('service_name', (options.serviceName ?? this.config.serviceName)!);
    const autofill = options.autofillHash ?? this.config.autofillHash;
    if (autofill) {
      if (autofill.length > 32) throw new ResalaApiError('Android autofill hash is too long', 422);
      query.set('autofill', autofill);
    }
    const suffix = `${this.config.production ? '' : 'test&'}${query.toString()}`;
    return this.request<ResalaPinResponse>('POST', `pins?${suffix}`, { phone: number });
  }

  async sendTemplate(templateId: string, records: ResalaTemplateRecord[]) {
    if (!/^[0-9a-fA-F-]{36}$/.test(templateId)) throw new ResalaApiError('Invalid template ID', 422);
    if (!records.length) throw new ResalaApiError('At least one template record is required', 422);
    const body = { records: records.map((record) => ({ ...record, phone: normalizeResalaPhone(record.phone) })) };
    const query = `${this.config.production ? '' : 'test&'}sms_template_id=${encodeURIComponent(templateId)}`;
    return this.request<Record<string, unknown>>('POST', `messages/send-template?${query}`, body);
  }

  async sentView(options: { source: 'pin' | 'message'; page?: number; paginate?: number }) {
    const page = options.page ?? 1;
    const paginate = options.paginate ?? 10;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(paginate) || paginate < 1 || paginate > 100) {
      throw new ResalaApiError('Invalid delivery-log pagination', 422);
    }
    const query = new URLSearchParams({ filters: `source:${options.source}`, page: String(page), paginate: String(paginate), sorts: '-created_at' });
    return this.request<ResalaSentView>('GET', `sent-view?${query.toString()}`);
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    this.ensureConfigured();
    const url = `${this.baseUrl}/${path}`;
    for (let attempt = 0; attempt <= (method === 'GET' ? 2 : 0); attempt += 1) {
      let response: Response;
      try {
        response = await this.http(url, { method, headers: {
          authorization: `Bearer ${this.config.token}`, accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
      } catch {
        if (method === 'GET' && attempt < 2) { await this.sleep(100 * (2 ** attempt)); continue; }
        throw new ResalaApiError('Resala network request failed; check connectivity', null);
      }
      let raw: string;
      try { raw = await response.text(); }
      catch {
        if (method === 'GET' && attempt < 2) { await this.sleep(100 * (2 ** attempt)); continue; }
        throw new ResalaApiError('Resala network request failed while reading the response', null);
      }
      let data: unknown;
      try { data = raw ? JSON.parse(raw) : {}; }
      catch { throw new ResalaApiError('Resala returned a non-JSON response', response.status); }
      if (response.ok) return data as T;
      const message = data && typeof data === 'object' && !Array.isArray(data) && typeof (data as Record<string, unknown>).message === 'string'
        ? String((data as Record<string, unknown>).message) : 'Request rejected by Resala';
      if (response.status === 401) throw new ResalaApiError('Check RESALA_API_TOKEN: missing or invalid', 401);
      if (response.status === 403) throw new ResalaApiError('Resala account lacks permission for this endpoint', 403);
      if (response.status === 422) {
        const fields = validationErrors(data);
        throw new ResalaApiError(fields ? Object.entries(fields).map(([key, values]) => `${key}: ${values.join(', ')}`).join('; ') : message, 422, fields);
      }
      if (response.status === 400 && /credit|balance|رصيد|ائتمان/i.test(message)) {
        throw new ResalaApiError('Resala wallet has insufficient credit; do not retry automatically', 400);
      }
      throw new ResalaApiError(`Resala request failed: ${message}`, response.status);
    }
    throw new ResalaApiError('Resala network request failed', null);
  }
}
