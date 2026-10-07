export type PaymentStatus =
  | 'Pending'
  | 'Processing'
  | 'Paid'
  | 'Failed'
  | 'Cancelled'
  | 'Refunded'
  | 'PartiallyRefunded';

export interface CreatePaymentInput {
  idempotencyKey: string;
  orderId: string;
  userId: string;
  amount: string;
  currency: string;
  description: string;
  returnUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface CreatePaymentResult {
  providerTransactionId: string;
  status: PaymentStatus;
  redirectUrl?: string;
  rawResponse?: unknown;
}

export interface CheckPaymentInput {
  providerTransactionId: string;
}

export interface CancelPaymentInput {
  providerTransactionId: string;
  reason?: string;
}

export interface RefundPaymentInput {
  providerTransactionId: string;
  amount: string;
  reason: string;
}

export interface TransactionStatusInput {
  providerTransactionId: string;
}

export interface PaymentStatusResult {
  providerTransactionId: string;
  status: PaymentStatus;
  rawResponse?: unknown;
}

export interface RefundPaymentResult {
  refundTransactionId: string;
  status: PaymentStatus;
  rawResponse?: unknown;
}

export interface VerifyWebhookInput {
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
  parsedBody: unknown;
}

export interface VerifiedWebhookEvent {
  providerEventId: string;
  providerTransactionId: string;
  status: PaymentStatus;
  occurredAt: Date;
  rawEvent: unknown;
  amountMilli: string;
  currency: string;
}

export interface PaymentProvider {
  readonly code: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  checkPayment(input: CheckPaymentInput): Promise<PaymentStatusResult>;
  cancelPayment(input: CancelPaymentInput): Promise<PaymentStatusResult>;
  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>;
  getTransactionStatus(input: TransactionStatusInput): Promise<PaymentStatusResult>;
  verifyWebhook(input: VerifyWebhookInput): Promise<VerifiedWebhookEvent>;
}
