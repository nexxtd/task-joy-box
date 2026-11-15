import { Request, Response, NextFunction } from 'express';

// Track blocked or offending IPs in-memory
interface ViolationRecord {
  count: number;
  blockedUntil: number;
}

const violationMap = new Map<string, ViolationRecord>();
const VIOLATION_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_VIOLATIONS_BEFORE_BLOCK = 5;
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Clean up stale IPs periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of violationMap.entries()) {
    if (record.blockedUntil < now && now - record.blockedUntil > VIOLATION_WINDOW_MS) {
      violationMap.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

// Malicious scanner bot User-Agents
const MALICIOUS_USER_AGENTS = [
  /sqlmap/i,
  /nikto/i,
  /acunetix/i,
  /wprecon/i,
  /dirbuster/i,
  /gobuster/i,
  /nuclei/i,
  /havij/i,
  /nmap\s+scripting/i,
  /masscan/i,
  /python-requests\/.*exploit/i,
  /morfeus\s+fucking\s+scanner/i,
  /zgrab/i,
];

// Sensitive or probing path patterns
const SENSITIVE_PATH_PATTERNS = [
  /(?:^|\/)\.env(?:$|\/|\.)/i,
  /(?:^|\/)\.git(?:$|\/)/i,
  /(?:^|\/)\.aws(?:$|\/)/i,
  /(?:^|\/)\.ssh(?:$|\/)/i,
  /(?:^|\/)\.well-known\/(?!acme-challenge)/i,
  /wp-config\.php/i,
  /wp-login\.php/i,
  /xmlrpc\.php/i,
  /phpinfo\.php/i,
  /eval-stdin\.php/i,
  /vendor\/phpunit/i,
  /cgi-bin\//i,
  /\/(?:etc\/(?:passwd|shadow|hosts))/i,
  /\/(?:proc\/self\/(?:environ|cmdline))/i,
  /(?:windows|winnt)\/system32/i,
  /boot\.ini/i,
];

// High-confidence SQL injection patterns in query params or URLs
const SQLI_PATTERNS = [
  /(\bunion\b\s+(all\s+)?\bselect\b)/i,
  /(\bbenchmark\s*\(\s*\d+\s*,)/i,
  /(\bpg_sleep\s*\(\s*\d+\s*\))/i,
  /(\bwaitfor\s+delay\s+['"\d])/i,
  /(;\s*drop\s+table\b)/i,
  /(;\s*truncate\s+table\b)/i,
  /(;\s*delete\s+from\b)/i,
  /(\bexec(\s|\+)+(sp_|xp_))/i,
  /('\s*(or|and)\s+['"\d\w]+\s*=\s*['"\d\w]+)/i,
];

// High-confidence Path Traversal patterns
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//,
  /\.\.\\/,
  /%2e%2e(?:%2f|%5c|\/|\\)/i,
  /\.\.%2f/i,
  /\.\.%5c/i,
];

// Strip prototype pollution keys from request bodies
export function sanitizePrototypePollution(obj: any): void {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      sanitizePrototypePollution(obj[i]);
    }
    return;
  }
  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      delete obj[key];
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizePrototypePollution(obj[key]);
    }
  }
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',');
    return ips[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function recordViolation(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
    return false;
  }
  const now = Date.now();
  let record = violationMap.get(ip);
  if (!record) {
    record = { count: 0, blockedUntil: 0 };
    violationMap.set(ip, record);
  }
  record.count += 1;
  if (record.count >= MAX_VIOLATIONS_BEFORE_BLOCK) {
    record.blockedUntil = now + BLOCK_DURATION_MS;
    return true;
  }
  return false;
}

export function firewall(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);
  const now = Date.now();

  // 1. Check if IP is currently banned
  const record = violationMap.get(ip);
  if (record && record.blockedUntil > now) {
    res.status(403).json({
      error: 'Access blocked by security firewall. Please try again later.',
      code: 'FIREWALL_BLOCKED',
    });
    return;
  }

  // 2. Malicious user-agent scan
  const userAgent = req.headers['user-agent'] || '';
  for (const pattern of MALICIOUS_USER_AGENTS) {
    if (pattern.test(userAgent)) {
      recordViolation(ip);
      res.status(403).json({ error: 'Request blocked by firewall rules.', code: 'MALICIOUS_AGENT' });
      return;
    }
  }

  // 3. Sensitive / probe paths
  const rawPath = req.path || '';
  const decodedPath = (() => {
    try {
      return decodeURIComponent(rawPath);
    } catch {
      return rawPath;
    }
  })();

  for (const pattern of SENSITIVE_PATH_PATTERNS) {
    if (pattern.test(rawPath) || pattern.test(decodedPath)) {
      recordViolation(ip);
      res.status(403).json({ error: 'Access forbidden.', code: 'FIREWALL_PATH_REJECTED' });
      return;
    }
  }

  // 4. Path traversal check on URL and query strings
  const originalUrl = req.originalUrl || '';
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(rawPath) || pattern.test(decodedPath) || pattern.test(originalUrl)) {
      recordViolation(ip);
      res.status(403).json({ error: 'Invalid path sequence detected.', code: 'PATH_TRAVERSAL' });
      return;
    }
  }

  // 5. Query parameters inspection for SQLi
  if (req.query && typeof req.query === 'object') {
    const queryString = Object.entries(req.query)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join('&');

    for (const pattern of SQLI_PATTERNS) {
      if (pattern.test(queryString)) {
        recordViolation(ip);
        res.status(403).json({ error: 'Potential SQL injection pattern detected.', code: 'SQLI_DETECTED' });
        return;
      }
    }
  }

  // 6. Sanitize JSON body against Prototype Pollution
  if (req.body && typeof req.body === 'object') {
    sanitizePrototypePollution(req.body);
  }

  // 7. Attach defense-in-depth security response headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  next();
}

const SKIP_BODY_KEYS = new Set([
  'fileData',
  'attachmentData',
  'imageData',
  'dataUrl',
  'password',
  'newPassword',
  'confirmPassword',
  'credential',
  'token',
  'code',
]);
const XSS_SCRIPT_PATTERNS = [
  /<script\b[^>]*>[\s\S]*?<\/script>/i,
  /<script\b[^>]*>/i,
  /\bjavascript\s*:/i,
  /\bvbscript\s*:/i,
  /<\s*(?:iframe|object|embed|applet)\b[^>]*\bon\w+\s*=/i,
];

function containsHighConfidenceThreat(val: unknown, keyPath: string, strictSql: boolean, depth = 0): string | null {
  if (depth > 8 || val == null) return null;
  if (typeof val === 'string') {
    if (SKIP_BODY_KEYS.has(keyPath) || val.startsWith('data:') || val.length > 25000) return null;
    for (const pat of XSS_SCRIPT_PATTERNS) {
      if (pat.test(val)) return 'XSS_PAYLOAD';
    }
    if (strictSql) {
      for (const pat of SQLI_PATTERNS) {
        if (pat.test(val)) return 'SQLI_DETECTED';
      }
      for (const pat of PATH_TRAVERSAL_PATTERNS) {
        if (pat.test(val)) return 'PATH_TRAVERSAL';
      }
    }
    return null;
  }
  if (Array.isArray(val)) {
    for (let i = 0; i < Math.min(val.length, 200); i++) {
      const hit = containsHighConfidenceThreat(val[i], keyPath, strictSql, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof val === 'object') {
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      const hit = containsHighConfidenceThreat(v, k, strictSql, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

/** Post-JSON body WAF inspection for SQLi/XSS/traversal in parsed payloads. */
export function inspectRequestBody(req: Request, res: Response, next: NextFunction): void {
  if (!req.body || typeof req.body !== 'object') {
    next();
    return;
  }
  const ip = getClientIp(req);
  const p = req.path || '';
  const strictSql =
    p.startsWith('/api/auth') ||
    p.startsWith('/api/payment') ||
    p.startsWith('/api/organizations') ||
    p.startsWith('/api/admin') ||
    p.startsWith('/api/settings');
  const threat = containsHighConfidenceThreat(req.body, '', strictSql);
  if (threat) {
    recordViolation(ip);
    res.status(403).json({
      error: 'Request payload rejected by security firewall.',
      code: threat,
    });
    return;
  }
  next();
}

