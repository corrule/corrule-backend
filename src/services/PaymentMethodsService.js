/**
 * Payment Methods Service
 * Handles all payment method operations in a provider-agnostic way
 */
const { PaymentProviderFactory } = require('./paymentProviders');
const User = require('../models/User');
const { errors } = require('../middleware/errorHandler');

class PaymentMethodsService {
  /**
   * Create a payment method (tokenized from provider)
   * @param {string} userId - User ID
   * @param {string} provider - Payment provider type ('stripe', 'paypal', etc.)
   * @param {Object} paymentData - Data from the provider (paymentMethodId, token, etc.)
   * @returns {Promise<Object>} - Created payment method
   */
  static async createPaymentMethod(userId, provider, paymentData) {
    const user = await User.findById(userId);
    if (!user) {
      throw errors.notFound('User not found');
    }

    // Get the payment provider
    const paymentProvider = PaymentProviderFactory.getProvider(provider);

    // Create payment method with the provider
    const pmDetails = await paymentProvider.createPaymentMethod(paymentData);

    // Check if this is the first payment method - make it default
    const isDefault = !user.paymentMethods || user.paymentMethods.length === 0;

    // If making this default, unset others
    if (isDefault && user.paymentMethods) {
      user.paymentMethods.forEach((pm) => {
        pm.isDefault = false;
      });
    }

    // Create payment method object to store
    const newPaymentMethod = {
      provider,
      providerPaymentMethodId: pmDetails.providerPaymentMethodId,
      last4: pmDetails.last4,
      brand: pmDetails.brand,
      expiryMonth: pmDetails.expiryMonth,
      expiryYear: pmDetails.expiryYear,
      paymentType: pmDetails.paymentType,
      isDefault,
      isActive: true,
    };

    if (!user.paymentMethods) {
      user.paymentMethods = [];
    }

    user.paymentMethods.push(newPaymentMethod);
    await user.save();

    // Return safe response (no sensitive data)
    return {
      _id: user.paymentMethods[user.paymentMethods.length - 1]._id,
      provider,
      last4: newPaymentMethod.last4,
      brand: newPaymentMethod.brand,
      paymentType: newPaymentMethod.paymentType,
      isDefault: newPaymentMethod.isDefault,
      createdAt: newPaymentMethod.createdAt,
    };
  }

  /**
   * Get all payment methods for a user
   */
  static async getPaymentMethods(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw errors.notFound('User not found');
    }

    // Return safe data (no provider IDs)
    return (user.paymentMethods || []).map((pm) => ({
      _id: pm._id,
      provider: pm.provider,
      last4: pm.last4,
      brand: pm.brand,
      expiryMonth: pm.expiryMonth,
      expiryYear: pm.expiryYear,
      paymentType: pm.paymentType,
      isDefault: pm.isDefault,
      isActive: pm.isActive,
      createdAt: pm.createdAt,
    }));
  }

  /**
   * Delete a payment method
   */
  static async deletePaymentMethod(userId, paymentMethodId) {
    const user = await User.findById(userId);
    if (!user) {
      throw errors.notFound('User not found');
    }

    const paymentMethod = user.paymentMethods?.find((pm) => pm._id.toString() === paymentMethodId);
    if (!paymentMethod) {
      throw errors.notFound('Payment method not found');
    }

    // Get the payment provider
    const paymentProvider = PaymentProviderFactory.getProvider(paymentMethod.provider);

    // Delete from provider
    await paymentProvider.deletePaymentMethod(paymentMethod.providerPaymentMethodId);

    // Remove from database
    user.paymentMethods = user.paymentMethods.filter((pm) => pm._id.toString() !== paymentMethodId);

    // If deleted payment method was default and there are others, make first one default
    const wasDefault = paymentMethod.isDefault;
    if (wasDefault && user.paymentMethods.length > 0) {
      user.paymentMethods[0].isDefault = true;
    }

    await user.save();

    return { success: true };
  }

  /**
   * Set a payment method as default
   */
  static async setDefaultPaymentMethod(userId, paymentMethodId) {
    const user = await User.findById(userId);
    if (!user) {
      throw errors.notFound('User not found');
    }

    const paymentMethod = user.paymentMethods?.find((pm) => pm._id.toString() === paymentMethodId);
    if (!paymentMethod) {
      throw errors.notFound('Payment method not found');
    }

    // Unset all others
    user.paymentMethods.forEach((pm) => {
      pm.isDefault = false;
    });

    // Set this one as default
    paymentMethod.isDefault = true;
    paymentMethod.updatedAt = new Date();

    await user.save();

    return {
      _id: paymentMethod._id,
      isDefault: true,
    };
  }

  /**
   * Get default payment method for a user
   */
  static async getDefaultPaymentMethod(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw errors.notFound('User not found');
    }

    const defaultPM = user.paymentMethods?.find((pm) => pm.isDefault);
    if (!defaultPM) {
      return null;
    }

    return {
      _id: defaultPM._id,
      provider: defaultPM.provider,
      providerPaymentMethodId: defaultPM.providerPaymentMethodId,
      last4: defaultPM.last4,
      brand: defaultPM.brand,
      paymentType: defaultPM.paymentType,
    };
  }

  /**
   * Process a payment using a payment method
   */
  static async processPayment(userId, paymentMethodId, chargeData) {
    const user = await User.findById(userId);
    if (!user) {
      throw errors.notFound('User not found');
    }

    const paymentMethod = user.paymentMethods?.find((pm) => pm._id.toString() === paymentMethodId);
    if (!paymentMethod) {
      throw errors.notFound('Payment method not found');
    }

    if (!paymentMethod.isActive) {
      throw errors.badRequest('Payment method is not active');
    }

    // Get the payment provider
    const paymentProvider = PaymentProviderFactory.getProvider(paymentMethod.provider);

    // Process payment
    const result = await paymentProvider.processPayment({
      ...chargeData,
      providerPaymentMethodId: paymentMethod.providerPaymentMethodId,
      customerId: this.getCustomerIdForProvider(user, paymentMethod.provider),
    });

    return result;
  }

  /**
   * Helper to get customer ID for a provider
   */
  static getCustomerIdForProvider(user, provider) {
    if (provider === 'stripe') {
      return user.billing?.stripeCustomerId;
    } else if (provider === 'paypal') {
      return user.billing?.paypalCustomerId;
    }
    throw new Error(`Unknown provider: ${provider}`);
  }

  /**
   * Set customer ID for a provider
   */
  static async setCustomerIdForProvider(userId, provider, customerId) {
    const user = await User.findById(userId);
    if (!user) {
      throw errors.notFound('User not found');
    }

    if (!user.billing) {
      user.billing = {};
    }

    if (provider === 'stripe') {
      user.billing.stripeCustomerId = customerId;
    } else if (provider === 'paypal') {
      user.billing.paypalCustomerId = customerId;
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }

    await user.save();
    return user;
  }
}

module.exports = PaymentMethodsService;
