/**
 * PayPal payment provider implementation
 */
const PaymentProvider = require('./PaymentProvider');

class PayPalProvider extends PaymentProvider {
  constructor(paypalClient) {
    super();
    this.client = paypalClient;
    if (!paypalClient) {
      throw new Error('PayPal client not initialized');
    }
  }

  /**
   * Create a payment method from PayPal setup token
   * Expects paymentData: { setupTokenId }
   * where setupTokenId is from PayPal frontend tokenization
   */
  async createPaymentMethod(paymentData) {
    try {
      const { setupTokenId, customerId } = paymentData;

      if (!setupTokenId) {
        throw new Error('PayPal setupTokenId is required');
      }

      // Confirm setup token to get billing agreement
      const response = await this.client.v3Request('POST', '/v3/billing/setup-tokens/{id}/agree', {
        id: setupTokenId,
      });

      // Extract payment source details
      const agreementId = response.result.id;

      return {
        providerPaymentMethodId: agreementId,
        last4: '****', // PayPal doesn't expose last4 easily
        brand: 'PAYPAL',
        expiryMonth: null,
        expiryYear: null,
        paymentType: 'paypal',
      };
    } catch (error) {
      throw new Error(`PayPal payment method creation failed: ${error.message}`);
    }
  }

  /**
   * Get a payment method details
   */
  async getPaymentMethod(providerPaymentMethodId) {
    try {
      const response = await this.client.v3Request(
        'GET',
        `/v3/billing/agreements/{id}`,
        {
          id: providerPaymentMethodId,
        }
      );

      return {
        id: response.result.id,
        last4: '****',
        brand: 'PAYPAL',
        expiryMonth: null,
        expiryYear: null,
        paymentType: 'paypal',
      };
    } catch (error) {
      throw new Error(`Failed to retrieve PayPal payment method: ${error.message}`);
    }
  }

  /**
   * List payment methods for a customer
   * Note: PayPal doesn't have a direct customer concept like Stripe
   */
  async listPaymentMethods(providerCustomerId) {
    try {
      // This is a simplified implementation
      // In production, you'd need to track PayPal agreements per user
      return [];
    } catch (error) {
      throw new Error(`Failed to list PayPal payment methods: ${error.message}`);
    }
  }

  /**
   * Delete a payment method
   */
  async deletePaymentMethod(providerPaymentMethodId) {
    try {
      await this.client.v3Request(
        'DELETE',
        `/v3/billing/agreements/{id}`,
        {
          id: providerPaymentMethodId,
        }
      );
      return true;
    } catch (error) {
      throw new Error(`Failed to delete PayPal payment method: ${error.message}`);
    }
  }

  /**
   * Process a payment/charge
   */
  async processPayment(chargeData) {
    try {
      const { amount, currency, providerPaymentMethodId, description } = chargeData;

      const response = await this.client.v3Request('POST', '/v2/checkout/orders', {
        intent: 'CAPTURE',
        payer_id: providerPaymentMethodId,
        purchase_units: [
          {
            amount: {
              currency_code: currency,
              value: amount.toString(),
            },
            description,
          },
        ],
      });

      return {
        chargeId: response.result.id,
        status: response.result.status,
        amount,
        currency,
      };
    } catch (error) {
      throw new Error(`PayPal payment processing failed: ${error.message}`);
    }
  }

  /**
   * Refund a payment
   */
  async refundPayment(chargeId, amount) {
    try {
      const response = await this.client.v3Request('POST', `/v2/checkout/orders/{id}/refund`, {
        id: chargeId,
      });

      return {
        refundId: response.result.id,
        status: response.result.status,
        amount,
      };
    } catch (error) {
      throw new Error(`PayPal refund failed: ${error.message}`);
    }
  }

  /**
   * Get provider type
   */
  getProviderType() {
    return 'paypal';
  }
}

module.exports = PayPalProvider;
