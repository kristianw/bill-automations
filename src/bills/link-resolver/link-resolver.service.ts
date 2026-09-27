import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { isSafeToFetch } from '../ssrf.guard.ts'


const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 25 * 1024 * 1024; // safety cap - these should be single PDFs, not large downloads
const MAX_REDIRECTS = 5;
const PDF_MAGIC = Buffer.from('%PDF');

export interface ResolvedPdf {
  bytes: Buffer;
  finalUrl: string;
}

@Injectable()
export class LinkResolverService {
  private readonly logger = new Logger(LinkResolverService.name);

  /**
   * Follows a body link and, if it lands on an HTML page rather than a PDF,
   * makes one further hop to whatever on that page looks like the actual
   * PDF (covers tokenized "View Invoice" pages from Xero/QuickBooks/MYOB
   * etc., which often aren't the PDF itself but link straight to one).
   * Trusts magic bytes (the "%PDF" header) over Content-Type, since real
   * senders mislabel PDFs as application/octet-stream (see README) - the
   * same distrust applies to whatever serves these landing pages.
   * Returns null for anything that isn't resolvable this way, e.g. a page
   * that requires a real portal login - that's the expected outcome for
   * those and is treated as "needs manual pickup", not an error.
   */
  async resolveToPdf(url: string, linkKeywords: string[], allowOneHop = true): Promise<ResolvedPdf | null> {
    const fetched = await this.safeFetch(url);
    if (!fetched) return null;

    if (this.looksLikePdf(fetched.bytes)) {
      return { bytes: fetched.bytes, finalUrl: fetched.finalUrl };
    }

    if (!allowOneHop) return null;

    const looksLikeHtml =
      (fetched.contentType ?? '').includes('text/html') ||
      fetched.bytes.subarray(0, 512).toString('utf8').toLowerCase().includes('<html');
    if (!looksLikeHtml) return null;

    const nextUrl = this.findBestPdfLinkInHtml(fetched.bytes.toString('utf8'), fetched.finalUrl, linkKeywords);
    if (!nextUrl) return null;

    this.logger.debug(`One more hop from ${fetched.finalUrl} -> ${nextUrl}`);
    return this.resolveToPdf(nextUrl, [], false);
  }

  private looksLikePdf(bytes: Buffer): boolean {
    return bytes.subarray(0, 4).equals(PDF_MAGIC);
  }

  private findBestPdfLinkInHtml(html: string, baseUrl: string, linkKeywords: string[]): string | null {
    const $ = cheerio.load(html);
    let directHit: string | null = null;
    let keywordHit: string | null = null;

    $('a[href]').each((_: any, el: any) => {
      const href = $(el).attr('href')?.trim();
      if (!href) return;
      let resolved: string;
      try {
        resolved = new URL(href, baseUrl).toString();
      } catch {
        return;
      }
      if (!/^https?:\/\//i.test(resolved)) return;

      if (!directHit && /\.pdf(\?|#|$)/i.test(resolved)) {
        directHit = resolved;
      }
      if (!keywordHit && linkKeywords.some((kw: any) => $(el).text().trim().toLowerCase().includes(kw))) {
        keywordHit = resolved;
      }
    });

    return directHit ?? keywordHit;
  }

  /** Fetches with manual redirect handling so every hop - not just the
   * first URL - is checked against isSafeToFetch before being requested. */
  private async safeFetch(
    url: string,
    redirectsLeft = MAX_REDIRECTS,
  ): Promise<{ bytes: Buffer; contentType: string | null; finalUrl: string } | null> {
    if (redirectsLeft <= 0) {
      this.logger.warn(`Too many redirects resolving ${url}, giving up`);
      return null;
    }
    if (!(await isSafeToFetch(url))) {
      this.logger.warn(`Refusing to fetch ${url} - resolves to a private/loopback/link-local address`);
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { redirect: 'manual', signal: controller.signal });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) return null;
        const nextUrl = new URL(location, url).toString();
        return this.safeFetch(nextUrl, redirectsLeft - 1);
      }

      if (!res.ok) {
        this.logger.debug(`GET ${url} -> ${res.status}, skipping`);
        return null;
      }

      const contentLength = res.headers.get('content-length');
      if (contentLength && Number(contentLength) > MAX_BYTES) {
        this.logger.warn(`${url} reports ${contentLength} bytes, skipping (over safety cap)`);
        return null;
      }

      const arrayBuffer = await res.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_BYTES) {
        this.logger.warn(`${url} body exceeded safety cap, skipping`);
        return null;
      }

      return {
        bytes: Buffer.from(arrayBuffer),
        contentType: res.headers.get('content-type'),
        finalUrl: url,
      };
    } catch (err) {
      this.logger.debug(`Fetching ${url} failed: ${err}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
