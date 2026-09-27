import { Injectable } from '@nestjs/common';
import type { BillDetectionResult } from './bill-detection.types.ts'

@Injectable()
export class BillDetectionService {

  private readonly SUBJECT_KEYWORDS = [
    'invoice',
    'bill',
    'statement',
    'amount due',
    'payment due',
    'payment reminder',
    'receipt',
  ];

  private readonly BODY_KEYWORDS = [
    'amount due',
    'total due',
    'payment due',
    'due date',
    'outstanding balance',
    'pay now',
    'pay this bill',
  ];

  detect(params: { subject: string; bodyText: string }): BillDetectionResult {
    const subjectMatches = this.includesKeyword(params.subject, this.SUBJECT_KEYWORDS);
    const bodyMatches = this.includesKeyword(params.bodyText, this.BODY_KEYWORDS);
    const matchedKeywords = [...new Set([...subjectMatches, ...bodyMatches])];

    return {
      isBill: matchedKeywords.length > 0,
      matchedKeywords,
    };
  }

  includesKeyword(haystack: string, keywords: string[]): string[] {
    const lower = haystack.toLowerCase();
    return keywords.filter((kw) => lower.includes(kw));
  }
}


