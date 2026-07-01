export type { OcrField, OcrExtraction, RawOcrWord, RawOcrResult } from "./types.js";
export type { OcrWord, RecognizeOptions } from "./ocr.js";
export { recognizeBillImage } from "./ocr.js";
export {
  extractBillFields,
  extractUsageKwh,
  extractUsageM3,
  extractContractType,
  extractBillingMonth,
  extractSupplyAddress,
} from "./ocr-extract.js";
