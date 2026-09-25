import * as nodemailer from 'nodemailer';

interface SendEmailOpts {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (host && user && pass) {
    if (!transporter) {
      transporter = nodemailer.createTransport({
        host,
        port: port || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user, pass },
      });
    }
    return transporter;
  }
  if (process.env.SMTP_SERVICE && user && pass) {
    if (!transporter) {
      transporter = nodemailer.createTransport({
        service: process.env.SMTP_SERVICE,
        auth: { user, pass },
      });
    }
    return transporter;
  }
  return null;
}

export async function sendEmail(opts: SendEmailOpts): Promise<boolean> {
  const configuredFrom = process.env.EMAIL_FROM || process.env.SMTP_USER || 'onboarding@resend.dev';
  const resendKey = process.env.RESEND_API_KEY;

  async function sendViaResend(from: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html: opts.html, text: opts.text }),
      });
      if (!res.ok) {
        const err = await res.text();
        return { ok: false, error: err };
      }
      console.log(`[email:resend] sent to ${opts.to} subject="${opts.subject}" from="${from}"`);
      return { ok: true };
    } catch (e: any) {
      const msg = e?.message || String(e);
      console.error('[email:resend] error', msg);
      return { ok: false, error: msg };
    }
  }

  if (resendKey) {
    // First attempt with the configured sender.
    let result = await sendViaResend(configuredFrom);
    if (result.ok) return true;
    console.error('[email:resend] failed', result.error);

    // Common cause: EMAIL_FROM uses an unverified domain / gmail address.
    // Resend testing keys can only send from onboarding@resend.dev.
    // Retry once with the Resend test sender so 2FA / verification still works.
    const needsFallback =
      result.error?.includes('verify a domain') ||
      result.error?.includes('testing emails') ||
      result.error?.includes('Domain not verified') ||
      result.error?.includes('not verified');
    const fallbackFrom = 'onboarding@resend.dev';
    if (needsFallback && configuredFrom !== fallbackFrom) {
      console.log(`[email:resend] retrying with fallback sender ${fallbackFrom} (fix: verify a domain in Resend and set EMAIL_FROM)`);
      result = await sendViaResend(fallbackFrom);
      if (result.ok) return true;
      console.error('[email:resend] fallback also failed', result.error);
    }
    // Resend failed — try SMTP next if configured, otherwise report failure.
    // Do NOT return true here: callers need to know delivery failed.
  }
  const t = getTransporter();
  if (t) {
    try {
      await t.sendMail({ from: configuredFrom, to: opts.to, subject: opts.subject, html: opts.html, text: opts.text });
      console.log(`[email:smtp] sent to ${opts.to}`);
      return true;
    } catch (e) {
      console.error('[email:smtp] error', e);
      return false;
    }
  }
  if (resendKey) {
    // Resend is configured but rejected the send and no SMTP is available.
    console.log(`[email:failed] To: ${opts.to} Subject: ${opts.subject} — delivery failed. Text: ${opts.text || ''}`);
    return false;
  }
  console.log(`[email:mock] To: ${opts.to} Subject: ${opts.subject}\n${opts.text || opts.html.slice(0, 500)}`);
  console.log('[email:mock] No SMTP/RESEND configured — set RESEND_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS to actually deliver');
  return false;
}

export function verificationEmailHtml(name: string, link: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
<h2 style="color:#111">Verify your email — MyPlanner</h2>
<p>Hi ${name},</p>
<p>Please confirm your email by clicking the button below:</p>
<p><a href="${link}" style="display:inline-block;background:#000;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Verify email</a></p>
<p style="color:#666;font-size:13px">Or copy this link: ${link}</p>
<p style="color:#666;font-size:13px">This link expires in 24 hours.</p>
</div>`;
}

export function resetEmailHtml(name: string, link: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
<h2 style="color:#111">Reset your password — MyPlanner</h2>
<p>Hi ${name},</p>
<p>We received a request to reset your password. Click below to choose a new one:</p>
<p><a href="${link}" style="display:inline-block;background:#000;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Reset password</a></p>
<p style="color:#666;font-size:13px">Or copy this link: ${link}</p>
<p style="color:#666;font-size:13px">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
</div>`;
}

export function twoFactorEmailHtml(name: string, code: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
<h2 style="color:#111">Your login code — MyPlanner</h2>
<p>Hi ${name},</p>
<p>Your two-factor code is:</p>
<p style="font-size:28px;letter-spacing:8px;font-weight:800;background:#f5f5f5;padding:16px;text-align:center;border-radius:12px">${code}</p>
<p style="color:#666;font-size:13px">This code expires in 10 minutes. If you didn't try to log in, secure your account.</p>
</div>`;
}
