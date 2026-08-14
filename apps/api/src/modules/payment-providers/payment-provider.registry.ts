import { BadRequestException, Injectable } from "@nestjs/common";
import { PayTRService } from "./paytr/paytr.service";
import {
  IPaymentProvider,
  PAYMENT_PROVIDER_PAYTR,
} from "./payment-provider.interface";

/**
 * #89: resolves a payment provider by key so money-path consumers depend on the
 * {@link IPaymentProvider} contract rather than a concrete PSP. Today only PayTR
 * is registered; a second provider is added by registering it here (and giving it
 * a distinct `key`) — no consumer changes.
 */
@Injectable()
export class PaymentProviderRegistry {
  private readonly providers = new Map<string, IPaymentProvider>();

  constructor(private readonly paytr: PayTRService) {
    this.register(paytr);
  }

  private register(provider: IPaymentProvider): void {
    this.providers.set(provider.key, provider);
  }

  /**
   * Resolve the provider for a payment's `provider` key. Falls back to PayTR when
   * the key is absent (every current payment is PayTR); throws on an unknown key.
   */
  resolve(key?: string | null): IPaymentProvider {
    const providerKey = key || PAYMENT_PROVIDER_PAYTR;
    const provider = this.providers.get(providerKey);
    if (!provider) {
      throw new BadRequestException(
        `Unsupported payment provider: ${providerKey}`,
      );
    }
    return provider;
  }
}
