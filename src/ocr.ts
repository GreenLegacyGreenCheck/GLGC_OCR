import type { RawOcrResult } from "./types.js";

// Some OCR backends (PaddleOCR) report confidence as a 0–1 probability
// instead of Tesseract's 0–100 scale. A genuine 0–100 result essentially
// never scores below 1, so this rescaling is safe.
function normalizeConfidenceScale(result: RawOcrResult): RawOcrResult {
  if (result.confidence > 1) {
    return result;
  }

  return {
    ...result,
    confidence: result.confidence * 100,
    words: result.words.map((word) => ({
      ...word,
      confidence: word.confidence > 1 ? word.confidence : word.confidence * 100,
    })),
  };
}

function isRawOcrResult(value: unknown): value is RawOcrResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.text === "string" &&
    typeof candidate.confidence === "number" &&
    Array.isArray(candidate.words)
  );
}

export type RecognizeOptions = {
  /** S3 key to pass instead of uploading the file directly. */
  s3Key?: string;
};

/**
 * Send a bill image to the OCR backend and return the raw OCR result.
 *
 * @param file     The image file to recognise.
 * @param baseUrl  Root URL of the OCR backend (e.g. "https://api.example.com").
 *                 Falls back to the `OCR_API_BASE_URL` env var if omitted.
 */
export async function recognizeBillImage(
  file: File,
  baseUrl?: string,
  options?: RecognizeOptions,
): Promise<RawOcrResult> {
  const resolvedBaseUrl =
    baseUrl ??
    (typeof process !== "undefined"
      ? (process.env["OCR_API_BASE_URL"] ??
        process.env["NEXT_PUBLIC_API_BASE_URL"])
      : undefined);

  if (!resolvedBaseUrl) {
    throw new Error(
      "OCR API base URL이 설정되지 않았습니다. " +
        "baseUrl 파라미터 또는 OCR_API_BASE_URL 환경변수를 확인해주세요.",
    );
  }

  let response: Response;

  if (options?.s3Key) {
    response = await fetch(`${resolvedBaseUrl}/ocr/bill/s3`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ s3Key: options.s3Key }),
    });
  } else {
    const formData = new FormData();
    formData.set("image", file, file.name);
    response = await fetch(`${resolvedBaseUrl}/ocr/bill`, {
      method: "POST",
      body: formData,
    });
  }

  if (!response.ok) {
    throw new Error(`OCR 요청이 실패했습니다. (status: ${response.status})`);
  }

  const data: unknown = await response.json();

  if (!isRawOcrResult(data)) {
    throw new Error("OCR 서버 응답 형식이 올바르지 않습니다.");
  }

  return normalizeConfidenceScale(data);
}
