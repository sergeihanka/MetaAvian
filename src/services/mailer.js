import config from '../config/index.js';

if (!config.smtp2go.apiKey) {
  console.warn(
    '[mailer] SMTP2GO_API_KEY is not set — email sending is disabled. ' +
    'Verification and password reset emails will be skipped.'
  );
}

async function send({ to, subject, html, text }) {
  if (!config.smtp2go.apiKey) {
    console.warn('[mailer] Skipping email send (no API key). Would have sent:', subject, 'to', to);
    return;
  }

  const res = await fetch('https://api.smtp2go.com/v3/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: config.smtp2go.apiKey,
      to: [to],
      sender: config.emailFrom,
      subject,
      html_body: html,
      text_body: text,
    }),
  });

  const data = await res.json();
  if (!res.ok || data.data?.error) {
    throw new Error(`[mailer] SMTP2Go error: ${data.data?.error || res.statusText}`);
  }
}

/**
 * Send an email verification link.
 * @param {string} email - Recipient email address
 * @param {string} token - Raw (un-hashed) verification token
 */
export async function sendVerificationEmail(email, token) {
  const verifyUrl = `${config.clientUrl.replace(/\/$/, '')}/api/v1/auth/verify-email?token=${token}`;

  const msg = {
    to: email,
    subject: 'Verify your Aviary account',
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Welcome to Aviary!</h2>
        <p>Please verify your email address by clicking the button below. The link expires in 24 hours.</p>
        <p style="margin: 24px 0;">
          <a href="${verifyUrl}"
             style="background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Verify Email
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">
          Or copy this link into your browser:<br />
          <a href="${verifyUrl}" style="color: #2563eb;">${verifyUrl}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">
          If you did not create an Aviary account, you can safely ignore this email.
        </p>
      </div>
    `,
    text: `Welcome to Aviary!\n\nVerify your email address by visiting this link (expires in 24 hours):\n\n${verifyUrl}\n\nIf you did not create an account, ignore this email.`,
  };

  await send(msg);
}

/**
 * Send a password reset link.
 * @param {string} email - Recipient email address
 * @param {string} token - Raw (un-hashed) reset token
 */
export async function sendPasswordResetEmail(email, token) {
  const resetUrl = `${config.clientUrl.replace(/\/$/, '')}/reset-password?token=${token}`;

  const msg = {
    to: email,
    subject: 'Reset your Aviary password',
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Password Reset</h2>
        <p>We received a request to reset the password for the Aviary account associated with this email. The link expires in 1 hour.</p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}"
             style="background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Reset Password
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">
          Or copy this link into your browser:<br />
          <a href="${resetUrl}" style="color: #2563eb;">${resetUrl}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">
          If you did not request a password reset, you can safely ignore this email.
          Your password will not be changed.
        </p>
      </div>
    `,
    text: `Password Reset\n\nReset your Aviary password by visiting this link (expires in 1 hour):\n\n${resetUrl}\n\nIf you did not request a reset, ignore this email.`,
  };

  await send(msg);
}
