// Shared PayPal Orders v2 helper.
// The legacy `paypal-rest-sdk` (/v1/payments) is deprecated and rejects newer
// PayPal apps with `invalid_client` — all checkout flows must use this module.

export function getPayPalMode(): 'live' | 'sandbox' {
  return (process.env.PAYPAL_MODE || 'sandbox').trim().toLowerCase() === 'live'
    ? 'live'
    : 'sandbox';
}

export function getPayPalApiBase(): string {
  return getPayPalMode() === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

export function getPayPalCredentials(): { clientId: string; clientSecret: string } {
  // Trim: copy-paste from PayPal dashboard / Render env often adds whitespace
  // which base64-encodes into a different secret -> `invalid_client`.
  return {
    clientId: (process.env.PAYPAL_CLIENT_ID || '').trim(),
    clientSecret: (process.env.PAYPAL_CLIENT_SECRET || '').trim(),
  };
}

export function isPayPalConfigured(): boolean {
  const { clientId, clientSecret } = getPayPalCredentials();
  return Boolean(clientId && clientSecret);
}

let tokenCache: { token: string; expiresAt: number; mode: string } | null = null;

export function clearPayPalTokenCache(): void {
  tokenCache = null;
}

export async function getPayPalAccessToken(): Promise<string> {
  const mode = getPayPalMode();
  if (tokenCache && tokenCache.mode === mode && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }
  const { clientId, clientSecret } = getPayPalCredentials();
  if (!clientId || !clientSecret) {
    throw new Error('PayPal is not configured (missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET)');
  }
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`${getPayPalApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    tokenCache = null;
    const body = await res.text().catch(() => '');
    // Never log the secret; prefix + mode is enough to diagnose live/sandbox mismatch.
    throw new Error(
      `PayPal authentication failed (${res.status}) in ${mode} mode ` +
      `(client_id prefix "${clientId.slice(0, 6)}...", secret length ${clientSecret.length}): ${body.slice(0, 300)}`
    );
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('PayPal authentication returned no access token');
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    mode,
  };
  return data.access_token;
}

const newRequestId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export async function createPayPalOrder(options: {
  amount: string;
  returnUrl: string;
  cancelUrl: string;
  description: string;
}): Promise<{ approvalUrl: string; paymentId: string }> {
  const token = await getPayPalAccessToken();
  const res = await fetch(`${getPayPalApiBase()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': newRequestId(),
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        description: options.description.slice(0, 127),
        amount: { currency_code: 'USD', value: options.amount },
      }],
      application_context: {
        brand_name: 'Task Joy Box',
        return_url: options.returnUrl,
        cancel_url: options.cancelUrl,
        user_action: 'PAY_NOW',
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`PayPal order creation failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { id?: string; links?: Array<{ rel: string; href: string }> };
  const approvalUrl = data.links?.find((l) => l.rel === 'approve')?.href;
  if (!data.id || !approvalUrl) {
    throw new Error('No approval URL in PayPal response');
  }
  return { approvalUrl, paymentId: data.id };
}

export async function capturePayPalOrder(orderId: string): Promise<void> {
  const token = await getPayPalAccessToken();
  const res = await fetch(`${getPayPalApiBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': newRequestId(),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`PayPal capture failed (${res.status}): ${body.slice(0, 300)}`);
  }
}
