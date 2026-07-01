export type OcrField<T> = {
  value: T | null;
  confidence: number;
};

export type OcrExtraction = {
  rawText: string;
  confidence: number;
  usageKwh: OcrField<number>;
  usageM3: OcrField<number>;
  contractType: OcrField<string>;
  supplyAddress: OcrField<string>;
  billingMonth: OcrField<string>;
};

export type RawOcrWord = {
  text: string;
  confidence: number;
};

export type RawOcrResult = {
  text: string;
  confidence: number;
  words: RawOcrWord[];
};
