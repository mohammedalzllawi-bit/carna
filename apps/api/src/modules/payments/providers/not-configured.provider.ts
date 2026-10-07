import {
  CancelPaymentInput,
  CheckPaymentInput,
  CreatePaymentInput,
  PaymentProvider,
  RefundPaymentInput,
  TransactionStatusInput,
  VerifyWebhookInput,
} from '../payment-provider.interface';

export class NotConfiguredPaymentProvider implements PaymentProvider {
  constructor(readonly code: string) {}

  createPayment(_input: CreatePaymentInput) {
    return Promise.reject(this.error());
  }

  checkPayment(_input: CheckPaymentInput) {
    return Promise.reject(this.error());
  }

  cancelPayment(_input: CancelPaymentInput) {
    return Promise.reject(this.error());
  }

  refundPayment(_input: RefundPaymentInput) {
    return Promise.reject(this.error());
  }

  getTransactionStatus(_input: TransactionStatusInput) {
    return Promise.reject(this.error());
  }

  verifyWebhook(_input: VerifyWebhookInput) {
    return Promise.reject(this.error());
  }

  private error() {
    return new Error(
      `Payment provider "${this.code}" is not configured. Add official provider documentation, merchant credentials, and signature rules before enabling it.`,
    );
  }
}

