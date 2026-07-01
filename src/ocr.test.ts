import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BASE_URL = "https://api.example.com";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("recognizeBillImage", () => {
  it("posts the image to the OCR endpoint and returns the parsed result", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        text: "hello",
        confidence: 80,
        words: [
          { text: "hello", confidence: 95 },
          { text: "world", confidence: 70 },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { recognizeBillImage } = await import("./ocr.js");
    const file = new File(["bill"], "bill.png", { type: "image/png" });
    const result = await recognizeBillImage(file, BASE_URL);

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/ocr/bill`,
      expect.objectContaining({ method: "POST" }),
    );
    const requestBody = fetchMock.mock.calls[0][1].body as FormData;
    const uploadedImage = requestBody.get("image") as File;
    expect(uploadedImage).toBeInstanceOf(File);
    expect(uploadedImage.name).toBe(file.name);
    expect(result).toEqual({
      text: "hello",
      confidence: 80,
      words: [
        { text: "hello", confidence: 95 },
        { text: "world", confidence: 70 },
      ],
    });
  });

  it("throws when the OCR server responds with a non-ok status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const { recognizeBillImage } = await import("./ocr.js");
    const file = new File(["bill"], "bill.png", { type: "image/png" });

    await expect(recognizeBillImage(file, BASE_URL)).rejects.toThrow("500");
  });

  it("throws when the OCR server response is shaped incorrectly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ unexpected: true }),
      }),
    );

    const { recognizeBillImage } = await import("./ocr.js");
    const file = new File(["bill"], "bill.png", { type: "image/png" });

    await expect(recognizeBillImage(file, BASE_URL)).rejects.toThrow(
      "OCR 서버 응답 형식이 올바르지 않습니다.",
    );
  });

  it("rescales a 0-1 confidence response up to the 0-100 scale", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          text: "hello",
          confidence: 0.85,
          words: [
            { text: "hello", confidence: 0.95 },
            { text: "world", confidence: 0.7 },
          ],
        }),
      }),
    );

    const { recognizeBillImage } = await import("./ocr.js");
    const file = new File(["bill"], "bill.png", { type: "image/png" });
    const result = await recognizeBillImage(file, BASE_URL);

    expect(result).toEqual({
      text: "hello",
      confidence: 85,
      words: [
        { text: "hello", confidence: 95 },
        { text: "world", confidence: 70 },
      ],
    });
  });

  it("throws a clear error when no base URL is provided", async () => {
    vi.stubGlobal("fetch", vi.fn());

    // Temporarily clear env vars that serve as fallback
    const savedOcr = process.env["OCR_API_BASE_URL"];
    const savedNext = process.env["NEXT_PUBLIC_API_BASE_URL"];
    delete process.env["OCR_API_BASE_URL"];
    delete process.env["NEXT_PUBLIC_API_BASE_URL"];

    const { recognizeBillImage } = await import("./ocr.js");
    const file = new File(["bill"], "bill.png", { type: "image/png" });

    await expect(recognizeBillImage(file)).rejects.toThrow(
      "OCR API base URL",
    );

    if (savedOcr) process.env["OCR_API_BASE_URL"] = savedOcr;
    if (savedNext) process.env["NEXT_PUBLIC_API_BASE_URL"] = savedNext;
  });

  it("sends an s3Key JSON body when the s3Key option is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: "t", confidence: 90, words: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { recognizeBillImage } = await import("./ocr.js");
    const file = new File(["bill"], "bill.png", { type: "image/png" });
    await recognizeBillImage(file, BASE_URL, { s3Key: "uploads/bill.jpg" });

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/ocr/bill/s3`,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ s3Key: "uploads/bill.jpg" }),
      }),
    );
  });
});
