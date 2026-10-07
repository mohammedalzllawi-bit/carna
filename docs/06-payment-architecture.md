# Payment Architecture

## الهدف

دعم مزودات دفع ليبية ومستقبلية دون ربط النظام بمزود واحد. لا يتم افتراض وجود API عام لأي مزود. كل Provider يبنى عند توفر وثائق رسمية ومفاتيح تاجر.

## Payment Provider Interface

```ts
export interface PaymentProvider {
  readonly code: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  checkPayment(input: CheckPaymentInput): Promise<PaymentStatusResult>;
  cancelPayment(input: CancelPaymentInput): Promise<PaymentStatusResult>;
  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>;
  getTransactionStatus(input: TransactionStatusInput): Promise<PaymentStatusResult>;
  verifyWebhook(input: VerifyWebhookInput): Promise<VerifiedWebhookEvent>;
}
```

## Providers

- `yesser-pay` placeholder adapter.
- `masrafy-pay` placeholder adapter.
- `mobicash` placeholder adapter.
- `edfa3-li` placeholder adapter.
- `onepay` future adapter.

كل adapter يبدأ كـ stub واضح يرمي خطأ `ProviderNotConfigured` حتى تتوفر الوثائق الرسمية.

## Payment Flow

1. Backend ينشئ `Order`.
2. Backend يحسب المبلغ من القواعد الديناميكية.
3. Backend ينشئ `Payment`.
4. `PaymentService` يختار provider من إعدادات Dashboard.
5. Provider يرجع رابط دفع أو token أو تعليمات.
6. Frontend يعرض تجربة الدفع.
7. Webhook يصل إلى Backend.
8. Backend يتحقق من التوقيع.
9. Backend يمنع التكرار عبر `providerEventId`.
10. Backend يطابق `transactionId`.
11. Backend يحدث `Payment` و`PaymentTransaction`.
12. Backend ينشئ Ledger entries.
13. Backend يرسل Notifications.

## حالات الدفع

- `Pending`
- `Processing`
- `Paid`
- `Failed`
- `Cancelled`
- `Refunded`
- `PartiallyRefunded`

## قواعد أمنية

- لا تعتمد على رسالة Frontend لتأكيد الدفع.
- كل webhook له raw body محفوظ أو hash محفوظ للتدقيق.
- لا تحفظ مفاتيح الدفع في Git.
- refunds تحتاج permission مالية وAudit Log.
- duplicate webhook لا يغير ledger مرتين.

