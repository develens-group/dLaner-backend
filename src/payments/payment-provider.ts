export interface CreatePaymentRequest {
  orderId: string;
  amountMinor: number;
  currency: string;
  returnUrl: string;
  cancelUrl: string;
}
export interface CreatePaymentResult {
  providerPaymentId: string;
  redirectUrl: string;
  safeResponse?: Record<string, unknown>;
}
export interface VerifyPaymentRequest {
  providerPaymentId: string;
  orderId: string;
  amountMinor: number;
  currency: string;
}
export interface VerifyPaymentResult {
  successful: boolean;
  failureCode?: string;
}
export interface PaymentWebhookResult {
  providerEventId: string;
  eventType: string;
  providerPaymentId: string;
  orderId: string;
  successful: boolean;
  payload: Record<string, unknown>;
}
export interface PaymentProvider {
  readonly name: string;
  createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResult>;
  verifyPayment(request: VerifyPaymentRequest): Promise<VerifyPaymentResult>;
  parseWebhook(payload: unknown, signature?: string): PaymentWebhookResult;
}
