export type { OcrField, OcrExtraction, RawOcrWord, RawOcrResult } from "./types.js";
export type { RecognizeOptions } from "./ocr.js";
export { recognizeBillImage } from "./ocr.js";
export type { OcrWord } from "./ocr-extract.js";
export {
  extractBillFields,
  extractUsageKwh,
  extractUsageM3,
  extractContractType,
  extractBillingMonth,
  extractSupplyAddress,
} from "./ocr-extract.js";
