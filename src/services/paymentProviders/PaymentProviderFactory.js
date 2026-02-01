/**
 * Payment Provider Factory
 * Manages initialization and routing to correct payment provider
 */
const StripeProvider = require('./StripeProvider');
const PayPalProvider = require('./PayPalProvider');

class PaymentProviderFactory {
  static providers = {};
  static initialized = false;

  /**
   * Initialize payment providers
   * Call this once during app startup
   */
  static initialize() {
    if (this.initialized) {
      return;
    }

    // Initialize Stripe
    if (process.env.STRIPE_SECRET_KEY) {
      const Stripe = require('stripe');
      const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
      this.providers.stripe = new StripeProvider(stripeClient);
      console.log('✓ Stripe provider initialized');
    }

    // Initialize PayPal (optional for now, can be added later)
    if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
      // TODO: Initialize PayPal client
      // const paypalClient = new PayPalClient(...);
      // this.providers.paypal = new PayPalProvider(paypalClient);
      console.log('⚠ PayPal provider not yet implemented');
    }

    this.initialized = true;
  }

  /**
   * Get a payment provider by type
   * @param {string} providerType - 'stripe', 'paypal', etc.
   * @returns {PaymentProvider} - The payment provider instance
   */
  static getProvider(providerType) {
    const provider = this.providers[providerType];

    if (!provider) {
      throw new Error(
        `Payment provider '${providerType}' not available. Available: ${Object.keys(this.providers).join(', ')}`
      );
    }

    return provider;
  }

  /**
   * Get all available providers
   */
  static getAvailableProviders() {
    return Object.keys(this.providers);
  }

  /**
   * Check if a provider is available
   */
  static isProviderAvailable(providerType) {
    return !!this.providers[providerType];
  }

  /**
   * Register a custom provider
   */
  static registerProvider(providerType, provider) {
    this.providers[providerType] = provider;
  }
}

module.exports = PaymentProviderFactory;
