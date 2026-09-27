import * as dns from 'node:dns/promises';
import * as net from 'node:net';

const BLOCKED_HOSTNAMES = new Set(['localhost']);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local, includes cloud metadata (169.254.169.254)
  if (a === 172 && b && b >= 16 && b <= 31) return true;
  return !!(a === 192 && b && b === 168);

}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
}

/**
 * Blocks fetches to loopback/private/link-local addresses (including cloud
 * metadata endpoints like 169.254.169.254). Body links come from untrusted
 * email content, so without this a crafted "bill" email could get this
 * server to fetch its own internal network (SSRF) - e.g. a link claiming to
 * be an invoice that actually points at http://localhost:3000/admin or a
 * cloud metadata service. Every redirect hop must be checked individually,
 * not just the first URL, since a public first hop can still redirect
 * somewhere internal.
 */
export async function isSafeToFetch(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (BLOCKED_HOSTNAMES.has(parsed.hostname.toLowerCase())) return false;

  const ipVersion = net.isIP(parsed.hostname);
  if (ipVersion) {
    return ipVersion === 4 ? !isPrivateIPv4(parsed.hostname) : !isPrivateIPv6(parsed.hostname);
  }

  try {
    const records = await dns.lookup(parsed.hostname, { all: true });
    if (records.length === 0) return false;
    return records.every((r) => (r.family === 4 ? !isPrivateIPv4(r.address) : !isPrivateIPv6(r.address)));
  } catch {
    return false; // can't resolve -> don't fetch
  }
}
