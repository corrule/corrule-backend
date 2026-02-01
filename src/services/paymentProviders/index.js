/**
 * Payment Providers Module
 * Exports all payment provider related classes and factory
 */

module.exports = {
  PaymentProvider: require('./PaymentProvider'),
  StripeProvider: require('./StripeProvider'),
  PayPalProvider: require('./PayPalProvider'),
  PaymentProviderFactory: require('./PaymentProviderFactory'),
};
