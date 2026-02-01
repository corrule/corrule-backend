/**
 * Stripe payment provider implementation
 */
const PaymentProvider = require('./PaymentProvider');

// Initialize Stripe - will be configured in factory
let stripe = null;

class StripeProvider extends PaymentProvider {
  constructor(stripeClient) {
    super();
    stripe = stripeClient;
    if (!stripe) {
      throw new Error('Stripe client not initialized');
    }
  }

  /**
   * Create a payment method from Stripe token
   * Expects paymentData: { paymentMethodId }
   * where paymentMethodId is from Stripe.js frontend tokenization
   */
  async createPaymentMethod(paymentData) {
    try {
      const { paymentMethodId } = paymentData;

      if (!paymentMethodId) {
        throw new Error('Stripe paymentMethodId is required');
      }

      // Retrieve payment method details from Stripe
      // This validates the token is valid and returns card info
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

      if (!paymentMethod) {
        throw new Error('Payment method not found or invalid');
      }

      // Return payment method details to be stored in database
      // We store the token (paymentMethodId) in the database, not the raw card data
      return {
        providerPaymentMethodId: paymentMethod.id,
        last4: paymentMethod.card.last4,
        brand: paymentMethod.card.brand.toUpperCase(),
        expiryMonth: paymentMethod.card.exp_month,
        expiryYear: paymentMethod.card.exp_year,
        paymentType: 'card',
      };
    } catch (error) {
      throw new Error(`Stripe payment method creation failed: ${error.message}`);
    }
  }

  /**
   * Get a payment method details
   */
  async getPaymentMethod(providerPaymentMethodId) {
    try {
      const paymentMethod = await stripe.paymentMethods.retrieve(providerPaymentMethodId);

      return {
        id: paymentMethod.id,
        last4: paymentMethod.card.last4,
        brand: paymentMethod.card.brand.toUpperCase(),
        expiryMonth: paymentMethod.card.exp_month,
        expiryYear: paymentMethod.card.exp_year,
        paymentType: 'card',
      };
    } catch (error) {
      throw new Error(`Failed to retrieve Stripe payment method: ${error.message}`);
    }
  }

  /**
   * List payment methods for a customer
   */
  async listPaymentMethods(providerCustomerId) {
    try {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: providerCustomerId,
        type: 'card',
      });

      return paymentMethods.data.map((pm) => ({
        id: pm.id,
        last4: pm.card.last4,
        brand: pm.card.brand.toUpperCase(),
        expiryMonth: pm.card.exp_month,
        expiryYear: pm.card.exp_year,
        paymentType: 'card',
      }));
    } catch (error) {
      throw new Error(`Failed to list Stripe payment methods: ${error.message}`);
    }
  }

  /**
   * Delete a payment method
   * Since we don't attach payment methods to customers,
   * we just mark them as inactive in the database
   * Stripe tokens remain valid until they expire naturally
   */
  async deletePaymentMethod(providerPaymentMethodId) {
    try {
      // Try to detach if it was attached, but don't fail if it wasn't
      try {
        await stripe.paymentMethods.detach(providerPaymentMethodId);
      } catch (detachError) {
        // If detach fails because it's not attached, that's fine
        // We only care if there's a different error
        if (!detachError.message.includes('not attached to a customer')) {
          throw detachError;
        }
      }
      return true;
    } catch (error) {
      throw new Error(`Failed to delete Stripe payment method: ${error.message}`);
    }
  }

  /**
   * Process a payment/charge
   */
  async processPayment(chargeData) {
    try {
      const { amount, currency, providerPaymentMethodId, customerId, description } = chargeData;

      const charge = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency.toLowerCase(),
        payment_method: providerPaymentMethodId,
        customer: customerId,
        confirm: true,
        description,
      });

      return {
        chargeId: charge.id,
        status: charge.status, // requires_action, processing, succeeded, etc.
        amount,
        currency,
      };
    } catch (error) {
      throw new Error(`Stripe payment processing failed: ${error.message}`);
    }
  }

  /**
   * Refund a payment
   */
  async refundPayment(chargeId, amount) {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: chargeId,
        amount: amount ? Math.round(amount * 100) : undefined,
      });

      return {
        refundId: refund.id,
        status: refund.status,
        amount: refund.amount / 100,
      };
    } catch (error) {
      throw new Error(`Stripe refund failed: ${error.message}`);
    }
  }

  /**
   * Create a Stripe customer
   */
  async createCustomer(userData) {
    try {
      const customer = await stripe.customers.create({
        email: userData.email,
        name: `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
        metadata: {
          userId: userData.userId,
        },
      });

      return customer.id;
    } catch (error) {
      throw new Error(`Failed to create Stripe customer: ${error.message}`);
    }
  }

  /**
   * Get provider type
   */
  getProviderType() {
    return 'stripe';
  }
}

module.exports = StripeProvider;
