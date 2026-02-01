/**
 * Abstract base class for payment providers
 * All payment providers must implement these methods
 */
class PaymentProvider {
  /**
   * Create a payment method with the provider
   * @param {Object} paymentData - Payment data specific to provider
   * @returns {Promise<Object>} - { providerPaymentMethodId, last4, brand, expiryMonth, expiryYear }
   */
  async createPaymentMethod(paymentData) {
    throw new Error('createPaymentMethod must be implemented by subclass');
  }

  /**
   * Get a payment method from the provider
   * @param {string} providerPaymentMethodId - ID from the provider
   * @returns {Promise<Object>} - Payment method details
   */
  async getPaymentMethod(providerPaymentMethodId) {
    throw new Error('getPaymentMethod must be implemented by subclass');
  }

  /**
   * List all payment methods for a customer
   * @param {string} providerCustomerId - Customer ID from the provider
   * @returns {Promise<Array>} - Array of payment methods
   */
  async listPaymentMethods(providerCustomerId) {
    throw new Error('listPaymentMethods must be implemented by subclass');
  }

  /**
   * Delete a payment method
   * @param {string} providerPaymentMethodId - ID from the provider
   * @returns {Promise<boolean>} - Success status
   */
  async deletePaymentMethod(providerPaymentMethodId) {
    throw new Error('deletePaymentMethod must be implemented by subclass');
  }

  /**
   * Process a payment/charge
   * @param {Object} chargeData - { amount, currency, providerPaymentMethodId, description }
   * @returns {Promise<Object>} - { chargeId, status, amount, currency }
   */
  async processPayment(chargeData) {
    throw new Error('processPayment must be implemented by subclass');
  }

  /**
   * Refund a payment
   * @param {string} chargeId - ID of the charge to refund
   * @param {number} amount - Amount to refund (optional, full refund if omitted)
   * @returns {Promise<Object>} - { refundId, status, amount }
   */
  async refundPayment(chargeId, amount) {
    throw new Error('refundPayment must be implemented by subclass');
  }

  /**
   * Get provider type identifier
   * @returns {string} - 'stripe', 'paypal', 'card', etc.
   */
  getProviderType() {
    throw new Error('getProviderType must be implemented by subclass');
  }
}

module.exports = PaymentProvider;
