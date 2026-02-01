// src/utils/email.js
const nodemailer = require("nodemailer");

// Create transporter
let transporter = null;

// Only initialize if email credentials are provided
if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_PORT === '465' ? true : false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  // Verify connection
  transporter.verify((error, success) => {
    if (error) {
      console.warn("⚠ Email service not available:", error.message);
      console.warn("⚠ Email features will be disabled");
      transporter = null;
    } else {
      console.log("✓ Email server ready");
    }
  });
} else {
  console.warn("⚠ Email credentials not configured - email features disabled");
}

// Helper function to check if email is enabled
const isEmailEnabled = () => {
  return transporter !== null;
};

// Corrule Brand Colors - Updated
const COLORS = {
  primary: '#14b8a5',        // Teal
  accent: '#14b8a5',         // Teal (accent same as primary)
  success: '#22C55E',        // Green
  destructive: '#EF4444',    // Red
  warning: '#FBBF24',        // Amber
  background: '#0c1322',     // Dark navy
  surface: '#FFFFFF',        // White
  muted: '#6B7280',          // Gray
  border: '#E5E7EB',         // Light gray
};

// Email template header component - Fixed logo visibility
const getEmailHeader = (backgroundColor = COLORS.primary) => `
  <div style="background: linear-gradient(135deg, ${backgroundColor} 0%, ${backgroundColor === COLORS.primary ? '#10a592' : backgroundColor} 100%); padding: 40px 20px; text-align: center;">
    <div style="display: inline-block; margin-bottom: 20px;">
      <div style="width: 60px; height: 60px; background-color: rgba(255, 255, 255, 0.2); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin: 0 auto;">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
        </svg>
      </div>
    </div>
    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Corrule</h1>
    <p style="color: rgba(255, 255, 255, 0.95); margin: 8px 0 0 0; font-size: 14px; font-weight: 500;">Security Rules Platform</p>
  </div>
`;

// Email template footer component
const getEmailFooter = () => `
  <div style="background-color: #f9fafb; border-top: 1px solid #e5e7eb; padding: 24px 30px; text-align: center;">
    <p style="color: #6b7280; font-size: 12px; margin: 0 0 12px 0;">
      © 2026 Corrule. All rights reserved.
    </p>
    <p style="color: #9ca3af; font-size: 11px; margin: 0;">
      You're receiving this email because of your Corrule account.
    </p>
  </div>
`;

// Send verification email
exports.sendVerificationEmail = async (email, token) => {
  if (!isEmailEnabled()) {
    console.warn("⚠ Email disabled - verification email not sent to:", email);
    return;
  }

  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${token}`;

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Verify Your Email - Corrule",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px 0;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: ${COLORS.surface}; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);">
                  <!-- Header -->
                  <tr>
                    <td>
                      ${getEmailHeader(COLORS.primary)}
                    </td>
                  </tr>

                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <h2 style="color: ${COLORS.background}; font-size: 24px; margin: 0 0 16px 0; font-weight: 600;">Welcome to Corrule!</h2>
                      
                      <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                        Thank you for creating an account with us. We're excited to have you join the Corrule community!
                      </p>

                      <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 30px 0;">
                        To complete your registration, please verify your email address by clicking the button below:
                      </p>

                      <!-- CTA Button -->
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="center" style="padding: 40px 0;">
                            <a href="${verificationUrl}" 
                               style="background: ${COLORS.primary}; color: #ffffff; 
                                      padding: 14px 40px; text-decoration: none; border-radius: 6px; display: inline-block;
                                      font-weight: 600; font-size: 16px;
                                      box-shadow: 0 4px 12px rgba(20, 184, 165, 0.3); letter-spacing: 0.3px;">
                              Verify Email Address
                            </a>
                          </td>
                        </tr>
                      </table>

                      <!-- Alternative Link -->
                      <p style="color: #6b7280; font-size: 13px; text-align: center; margin: 30px 0 10px 0;">
                        Or copy and paste this link in your browser:
                      </p>
                      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; color: ${COLORS.primary}; 
                                  padding: 12px 16px; border-radius: 6px; word-break: break-all; 
                                  font-size: 12px; margin: 0; font-family: 'Courier New', monospace; text-align: center;">
                        ${verificationUrl}
                      </div>

                      <!-- Security Note -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 30px;">
                        <tr>
                          <td style="background-color: rgba(20, 184, 165, 0.08); border-left: 4px solid ${COLORS.primary}; padding: 16px; border-radius: 4px;">
                            <p style="color: ${COLORS.primary}; font-size: 13px; margin: 0; font-weight: 500; line-height: 1.5;">
                              🔒 <strong>Security Notice:</strong> This link will expire in 24 hours. If you didn't create this account, please ignore this email.
                            </p>
                          </td>
                        </tr>
                      </table>

                      <!-- Footer Text -->
                      <p style="color: #9ca3af; font-size: 13px; line-height: 1.6; margin: 30px 0 0 0;">
                        If you have any questions or need assistance, feel free to reach out to our support team.
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td>
                      ${getEmailFooter()}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Verification email sent to:", email);
  } catch (error) {
    console.error("Failed to send verification email:", error.message);
  }
};

// Send password reset email
exports.sendPasswordResetEmail = async (email, token) => {
  if (!isEmailEnabled()) {
    console.warn("⚠ Email disabled - password reset email not sent to:", email);
    return;
  }

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${token}`;

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Password Reset Request - Corrule",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px 0;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: ${COLORS.surface}; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);">
                  <!-- Header -->
                  <tr>
                    <td>
                      ${getEmailHeader(COLORS.destructive)}
                    </td>
                  </tr>

                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <h2 style="color: ${COLORS.background}; font-size: 24px; margin: 0 0 16px 0; font-weight: 600;">Password Reset Request</h2>
                      
                      <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                        We received a request to reset your password for your Corrule account.
                      </p>

                      <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 30px 0;">
                        Click the button below to create a new password:
                      </p>

                      <!-- CTA Button -->
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="center" style="padding: 40px 0;">
                            <a href="${resetUrl}" 
                               style="background: ${COLORS.destructive}; color: #ffffff; 
                                      padding: 14px 40px; text-decoration: none; border-radius: 6px; display: inline-block;
                                      font-weight: 600; font-size: 16px;
                                      box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3); letter-spacing: 0.3px;">
                              Reset Password
                            </a>
                          </td>
                        </tr>
                      </table>

                      <!-- Alternative Link -->
                      <p style="color: #6b7280; font-size: 13px; text-align: center; margin: 30px 0 10px 0;">
                        Or copy and paste this link in your browser:
                      </p>
                      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; color: ${COLORS.destructive}; 
                                  padding: 12px 16px; border-radius: 6px; word-break: break-all; 
                                  font-size: 12px; margin: 0; font-family: 'Courier New', monospace; text-align: center;">
                        ${resetUrl}
                      </div>

                      <!-- Security Note -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 30px;">
                        <tr>
                          <td style="background-color: rgba(239, 68, 68, 0.08); border-left: 4px solid ${COLORS.destructive}; padding: 16px; border-radius: 4px;">
                            <p style="color: ${COLORS.destructive}; font-size: 13px; margin: 0; font-weight: 500; line-height: 1.5;">
                              ⏰ <strong>Expiration:</strong> This link will expire in 1 hour. If you didn't request a password reset, please ignore this email and your password will remain unchanged.
                            </p>
                          </td>
                        </tr>
                      </table>

                      <!-- Footer Text -->
                      <p style="color: #9ca3af; font-size: 13px; line-height: 1.6; margin: 30px 0 0 0;">
                        If you have any questions or didn't request this reset, please contact our support team immediately.
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td>
                      ${getEmailFooter()}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Password reset email sent to:", email);
  } catch (error) {
    console.error("Failed to send password reset email:", error.message);
  }
};

// Send rule approval notification
exports.sendRuleApprovedEmail = async (email, username, ruleTitle) => {
  if (!isEmailEnabled()) {
    console.warn("⚠ Email disabled - approval email not sent to:", email);
    return;
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Your Rule Has Been Approved! - Corrule",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px 0;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: ${COLORS.surface}; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);">
                  <!-- Header -->
                  <tr>
                    <td>
                      ${getEmailHeader(COLORS.success)}
                    </td>
                  </tr>

                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <h2 style="color: ${COLORS.success}; font-size: 24px; margin: 0 0 16px 0; font-weight: 600;">🎉 Rule Approved!</h2>
                      
                      <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                        Hi ${username},
                      </p>

                      <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                        Great news! Your rule <strong style="color: ${COLORS.background};">"${ruleTitle}"</strong> has been approved and is now live on the Corrule platform!
                      </p>

                      <!-- CTA Button -->
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="center" style="padding: 40px 0;">
                            <a href="${process.env.FRONTEND_URL}/rules" 
                               style="background: ${COLORS.success}; color: #ffffff; 
                                      padding: 14px 40px; text-decoration: none; border-radius: 6px; display: inline-block;
                                      font-weight: 600; font-size: 16px;
                                      box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3); letter-spacing: 0.3px;">
                              View Your Rules
                            </a>
                          </td>
                        </tr>
                      </table>

                      <!-- Success Badge -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 30px;">
                        <tr>
                          <td style="background-color: rgba(34, 197, 94, 0.08); border-left: 4px solid ${COLORS.success}; padding: 16px; border-radius: 4px;">
                            <p style="color: ${COLORS.success}; font-size: 13px; margin: 0; font-weight: 500; line-height: 1.5;">
                              ✓ Your rule is now visible to all users and can be purchased or used!
                            </p>
                          </td>
                        </tr>
                      </table>

                      <!-- Footer Text -->
                      <p style="color: #9ca3af; font-size: 13px; line-height: 1.6; margin: 30px 0 0 0;">
                        Thank you for contributing to the security community with quality rules!
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td>
                      ${getEmailFooter()}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Rule approved email sent to:", email);
  } catch (error) {
    console.error("Failed to send approval email:", error);
  }
};

// Send rule rejection notification
exports.sendRuleRejectedEmail = async (email, username, ruleTitle, reason) => {
  if (!isEmailEnabled()) {
    console.warn("⚠ Email disabled - rejection email not sent to:", email);
    return;
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Rule Review Update - Corrule",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px 0;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: ${COLORS.surface}; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);">
                  <!-- Header -->
                  <tr>
                    <td>
                      ${getEmailHeader(COLORS.warning)}
                    </td>
                  </tr>

                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <h2 style="color: ${COLORS.background}; font-size: 24px; margin: 0 0 16px 0; font-weight: 600;">Review Update</h2>
                      
                      <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                        Hi ${username},
                      </p>

                      <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                        Your rule <strong style="color: ${COLORS.background};">"${ruleTitle}"</strong> requires some updates before it can be published on the Corrule platform.
                      </p>

                      <!-- Feedback Box -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                        <tr>
                          <td style="background-color: rgba(251, 191, 36, 0.08); border-left: 4px solid ${COLORS.warning}; padding: 16px; border-radius: 4px;">
                            <p style="color: #D97706; font-size: 13px; margin: 0 0 12px 0; font-weight: 600;">📝 Reviewer Notes:</p>
                            <p style="color: #92400E; font-size: 14px; margin: 0; line-height: 1.5;">
                              ${reason}
                            </p>
                          </td>
                        </tr>
                      </table>

                      <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 30px 0;">
                        Please review the feedback and make the necessary changes. You can edit your rule and resubmit it for review at any time.
                      </p>

                      <!-- CTA Button -->
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="center" style="padding: 40px 0;">
                            <a href="${process.env.FRONTEND_URL}/rules/edit" 
                               style="background: ${COLORS.primary}; color: #ffffff; 
                                      padding: 14px 40px; text-decoration: none; border-radius: 6px; display: inline-block;
                                      font-weight: 600; font-size: 16px;
                                      box-shadow: 0 4px 12px rgba(20, 184, 165, 0.3); letter-spacing: 0.3px;">
                              Edit Rule
                            </a>
                          </td>
                        </tr>
                      </table>

                      <!-- Support Info -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 30px;">
                        <tr>
                          <td style="background-color: rgba(20, 184, 165, 0.08); border-left: 4px solid ${COLORS.primary}; padding: 16px; border-radius: 4px;">
                            <p style="color: ${COLORS.primary}; font-size: 13px; margin: 0; font-weight: 500; line-height: 1.5;">
                              💡 Need help? Feel free to reach out to our support team with any questions about the review feedback.
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td>
                      ${getEmailFooter()}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Rule rejected email sent to:", email);
  } catch (error) {
    console.error("Failed to send rejection email:", error);
  }
};

// Send purchase confirmation
exports.sendPurchaseConfirmationEmail = async (
  email,
  username,
  ruleTitle,
  amount,
) => {
  if (!isEmailEnabled()) {
    console.warn("⚠ Email disabled - purchase confirmation not sent to:", email);
    return;
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Purchase Confirmation - Corrule",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px 0;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: ${COLORS.surface}; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);">
                  <!-- Header -->
                  <tr>
                    <td>
                      ${getEmailHeader(COLORS.primary)}
                    </td>
                  </tr>

                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <h2 style="color: ${COLORS.primary}; font-size: 24px; margin: 0 0 16px 0; font-weight: 600;">✓ Purchase Successful!</h2>
                      
                      <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                        Hi ${username},
                      </p>

                      <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 30px 0;">
                        Thank you for your purchase! You now have full access to:
                      </p>

                      <!-- Purchase Details -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                        <tr>
                          <td style="background-color: rgba(20, 184, 165, 0.08); border-left: 4px solid ${COLORS.primary}; border-radius: 6px; padding: 20px;">
                            <h3 style="color: ${COLORS.primary}; margin: 0 0 12px 0; font-size: 18px; font-weight: 600;">${ruleTitle}</h3>
                            <p style="color: ${COLORS.primary}; margin: 0; font-size: 14px;">
                              <strong>Transaction Amount:</strong> $${amount}
                            </p>
                          </td>
                        </tr>
                      </table>

                      <!-- CTA Button -->
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="center" style="padding: 40px 0;">
                            <a href="${process.env.FRONTEND_URL}/my-purchases" 
                               style="background: ${COLORS.primary}; color: #ffffff; 
                                      padding: 14px 40px; text-decoration: none; border-radius: 6px; display: inline-block;
                                      font-weight: 600; font-size: 16px;
                                      box-shadow: 0 4px 12px rgba(20, 184, 165, 0.3); letter-spacing: 0.3px;">
                              View Purchase Details
                            </a>
                          </td>
                        </tr>
                      </table>

                      <!-- Info Box -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 30px;">
                        <tr>
                          <td style="background-color: rgba(34, 197, 94, 0.08); border-left: 4px solid ${COLORS.success}; padding: 16px; border-radius: 4px;">
                            <p style="color: ${COLORS.success}; font-size: 13px; margin: 0; font-weight: 500; line-height: 1.5;">
                              📥 Receipt and download links are available in your account dashboard and can be accessed anytime.
                            </p>
                          </td>
                        </tr>
                      </table>

                      <!-- Footer Text -->
                      <p style="color: #9ca3af; font-size: 13px; line-height: 1.6; margin: 30px 0 0 0;">
                        If you have any questions about your purchase or need support, please don't hesitate to reach out.
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td>
                      ${getEmailFooter()}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Purchase confirmation email sent to:", email);
  } catch (error) {
    console.error("Failed to send purchase confirmation:", error);
  }
};