import type { OcrExtraction } from "./types.js";

export type OcrWord = {
  text: string;
  confidence: number;
};

const CONTRACT_TYPE_KEYWORDS = [
  "산업용",
  "일반용",
  "교육용",
  "주택용",
  "아파트용",
  "가정용",
  "사업용",
  "영업용",
  "업무용",
];

// OCR commonly confuses a handful of digits with similarly-shaped letters
// (0/O, 1/l/I, 5/S, 8/B, 2/Z) — scoped to just the captured numeric run, so
// it can never bleed into label/unit matching.
const DIGIT_LOOKALIKES: [RegExp, string][] = [
  [/[oO]/g, "0"],
  [/[lLiI]/g, "1"],
  [/[sS]/g, "5"],
  [/[bB]/g, "8"],
  [/[zZ]/g, "2"],
];

function parseMatchedNumber(raw: string): number | null {
  const normalized = DIGIT_LOOKALIKES.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    raw.replace(/,/g, ""),
  );
  const value = Number.parseFloat(normalized);

  return Number.isFinite(value) ? value : null;
}

// "당월" (current month) is the value we want — bills also print "전월"
// (previous month) and "전년동월" (same month last year) right next to it
// in a usage-comparison table, so a generic "사용량" label match can latch
// onto the wrong column/row depending on how OCR linearizes the table.
// "전기료"/"가스료" is an additional anchor seen on apartment management-fee
// statements, where that label is used for the usage amount (not the cost).
export function extractUsageKwh(text: string): number | null {
  const currentMonth = text.match(
    /당월[^\doOlLiIsSbBzZ]{0,30}([\d,oOlLiIsSbBzZ]+(?:\.[\d,oOlLiIsSbBzZ]+)?)\s*k\s*wh/i,
  );

  if (currentMonth) {
    return parseMatchedNumber(currentMonth[1]);
  }

  const labeled = text.match(
    /(?:사용량|전기료)[^\doOlLiIsSbBzZ]{0,20}([\d,oOlLiIsSbBzZ]+(?:\.[\d,oOlLiIsSbBzZ]+)?)\s*k\s*wh/i,
  );

  if (labeled) {
    return parseMatchedNumber(labeled[1]);
  }

  const bare = text.match(
    /([\d,oOlLiIsSbBzZ]+(?:\.[\d,oOlLiIsSbBzZ]+)?)\s*k\s*wh/i,
  );

  return bare ? parseMatchedNumber(bare[1]) : null;
}

export function extractUsageM3(text: string): number | null {
  const currentMonth = text.match(
    /당월[^\doOlLiIsSbBzZ]{0,30}([\d,oOlLiIsSbBzZ]+(?:\.[\d,oOlLiIsSbBzZ]+)?)\s*(?:m\s*3|m\s*³|㎥)/i,
  );

  if (currentMonth) {
    return parseMatchedNumber(currentMonth[1]);
  }

  const labeled = text.match(
    /(?:사용량|가스료)[^\doOlLiIsSbBzZ]{0,20}([\d,oOlLiIsSbBzZ]+(?:\.[\d,oOlLiIsSbBzZ]+)?)\s*(?:m\s*3|m\s*³|㎥)/i,
  );

  if (labeled) {
    return parseMatchedNumber(labeled[1]);
  }

  const bare = text.match(
    /([\d,oOlLiIsSbBzZ]+(?:\.[\d,oOlLiIsSbBzZ]+)?)\s*(?:m\s*3|m\s*³|㎥)/i,
  );

  return bare ? parseMatchedNumber(bare[1]) : null;
}

// Note: real bills print a boilerplate notice mentioning welfare-discount
// eligibility categories on every bill regardless of the customer's actual
// status, so scanning the whole page for those words is an unreliable,
// false-positive-prone signal. 취약계층 classification relies on usage
// z-score instead.
export function extractContractType(text: string): string | null {
  return (
    CONTRACT_TYPE_KEYWORDS.find((keyword) => text.includes(keyword)) ?? null
  );
}

// Bills print the billing period as "2026년 6월" — normalize it to "2026-06"
// so it can be compared/sorted as a plain string elsewhere in the app. Some
// issuers print "2026.06" / "2026-06" instead, so that's a fallback too.
export function extractBillingMonth(text: string): string | null {
  const korean = text.match(/(\d{4})\s*년\s*(\d{1,2})\s*월/);

  if (korean) {
    return `${korean[1]}-${korean[2].padStart(2, "0")}`;
  }

  const delimited = text.match(/(\d{4})\s*[.\-/]\s*(\d{1,2})(?!\d)/);

  if (delimited) {
    const month = Number(delimited[2]);

    if (month >= 1 && month <= 12) {
      return `${delimited[1]}-${delimited[2].padStart(2, "0")}`;
    }
  }

  return null;
}

export function extractSupplyAddress(text: string): string | null {
  const match = text.match(
    /(?:공급받는\s*주소|사용\s*장소|공급\s*주소|주소)\s*[:\s]\s*([^\n]{5,40})/,
  );

  return match ? match[1].trim() : null;
}

function digitsOnly(text: string): string {
  return text.replace(/[^0-9.]/g, "");
}

// The page-wide confidence Tesseract reports gets dragged down by unrelated
// boilerplate (logos, fine print, decorative icons) that we never read. Once
// word-level data is available, a field's confidence should reflect the
// specific word(s) that produced its value instead of the whole page.
function fieldConfidence(
  words: OcrWord[],
  predicate: (word: OcrWord) => boolean,
  fallback: number,
): number {
  const matches = words.filter(predicate);

  if (matches.length === 0) {
    return fallback;
  }

  return (
    matches.reduce((sum, word) => sum + word.confidence, 0) / matches.length
  );
}

function numberFieldConfidence(
  words: OcrWord[],
  value: number | null,
  fallback: number,
): number {
  if (value === null) {
    return 0;
  }

  const target = String(value);

  return fieldConfidence(
    words,
    (word) => digitsOnly(word.text) === target,
    fallback,
  );
}

function textFieldConfidence(
  words: OcrWord[],
  value: string | null,
  fallback: number,
): number {
  if (value === null) {
    return 0;
  }

  return fieldConfidence(words, (word) => word.text.includes(value), fallback);
}

function billingMonthConfidence(
  words: OcrWord[],
  value: string | null,
  fallback: number,
): number {
  if (value === null) {
    return 0;
  }

  const [year, month] = value.split("-");
  const monthUnpadded = String(Number(month));
  const yearConfidence = fieldConfidence(
    words,
    (word) => digitsOnly(word.text) === year,
    fallback,
  );
  const monthConfidence = fieldConfidence(
    words,
    (word) =>
      digitsOnly(word.text) === month ||
      digitsOnly(word.text) === monthUnpadded,
    fallback,
  );

  return (yearConfidence + monthConfidence) / 2;
}

export function extractBillFields(
  rawText: string,
  confidence: number,
  words: OcrWord[] = [],
): OcrExtraction {
  const usageKwh = extractUsageKwh(rawText);
  const usageM3 = extractUsageM3(rawText);
  const contractType = extractContractType(rawText);
  const supplyAddress = extractSupplyAddress(rawText);
  const billingMonth = extractBillingMonth(rawText);

  return {
    rawText,
    confidence,
    usageKwh: {
      value: usageKwh,
      confidence: numberFieldConfidence(words, usageKwh, confidence),
    },
    usageM3: {
      value: usageM3,
      confidence: numberFieldConfidence(words, usageM3, confidence),
    },
    contractType: {
      value: contractType,
      confidence: textFieldConfidence(words, contractType, confidence),
    },
    supplyAddress: {
      value: supplyAddress,
      confidence: supplyAddress !== null ? confidence : 0,
    },
    billingMonth: {
      value: billingMonth,
      confidence: billingMonthConfidence(words, billingMonth, confidence),
    },
  };
}
