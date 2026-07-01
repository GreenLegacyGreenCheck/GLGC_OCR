import { describe, expect, it } from "vitest";
import {
  extractBillFields,
  extractBillingMonth,
  extractContractType,
  extractSupplyAddress,
  extractUsageKwh,
  extractUsageM3,
} from "./ocr-extract.js";

describe("extractUsageKwh", () => {
  it("extracts a labeled usage value", () => {
    expect(extractUsageKwh("사용량 287 kWh\n계약종별 주택용")).toBe(287);
  });

  it("falls back to the first bare kWh value", () => {
    expect(extractUsageKwh("총 사용 전력: 1,204kWh 입니다")).toBe(1204);
  });

  it("prefers the 당월 value over 전월/전년동월 in a usage-comparison table", () => {
    const text = "사용량비교\n당월   302 kWh\n전월   267 kWh\n전년동월 260 kWh";

    expect(extractUsageKwh(text)).toBe(302);
  });

  it("prefers 당월 even when OCR linearizes labels before values", () => {
    const text = "당월\n전월\n전년동월\n302 kWh\n267 kWh\n260 kWh";

    expect(extractUsageKwh(text)).toBe(302);
  });

  it("returns null when nothing matches", () => {
    expect(extractUsageKwh("고지서 내용을 인식할 수 없습니다")).toBeNull();
  });

  it("extracts a value labeled 전기료 on an apartment management-fee statement", () => {
    expect(extractUsageKwh("전기료 86kWh")).toBe(86);
  });

  it("corrects common OCR digit/letter confusions within the matched number", () => {
    expect(extractUsageKwh("사용량 8O kWh")).toBe(80);
    expect(extractUsageKwh("당월 l,2O4 kWh")).toBe(1204);
  });
});

describe("extractUsageM3", () => {
  it("extracts a labeled usage value with a unicode cubic meter sign", () => {
    expect(extractUsageM3("가스 사용량 45m³")).toBe(45);
  });

  it("extracts a bare m3 value", () => {
    expect(extractUsageM3("사용한 가스량 12.5 m3")).toBe(12.5);
  });

  it("prefers the 당월 value over 전월/전년동월 in a usage-comparison table", () => {
    const text = "사용량비교\n당월 42.7m³\n전월 38.1m³\n전년동월 40.5m³";

    expect(extractUsageM3(text)).toBe(42.7);
  });

  it("returns null when nothing matches", () => {
    expect(extractUsageM3("내용 없음")).toBeNull();
  });

  it("extracts a value labeled 가스료 on an apartment management-fee statement", () => {
    expect(extractUsageM3("가스료 12.5m³")).toBe(12.5);
  });
});

describe("extractContractType", () => {
  it("finds a known contract type keyword anywhere in the text", () => {
    expect(extractContractType("계약종별: 일반용 전력")).toBe("일반용");
  });

  it("finds residential contract type variants", () => {
    expect(extractContractType("계약종별 주택용전력")).toBe("주택용");
    expect(extractContractType("계약종별 아파트용")).toBe("아파트용");
    expect(extractContractType("계약종별 가정용")).toBe("가정용");
  });

  it("finds additional business contract type variants", () => {
    expect(extractContractType("계약종별 사업용")).toBe("사업용");
    expect(extractContractType("계약종별 영업용")).toBe("영업용");
    expect(extractContractType("계약종별 업무용")).toBe("업무용");
  });

  it("ignores a welfare-discount eligibility notice printed on every bill", () => {
    const text =
      "전기요금 복지할인제도를 운영하고 있으니 기초생활수급자, 사회복지시설 등에 해당되시는 경우 신청하시어 할인혜택을 받으시기 바랍니다.\n계약종별 주택용전력";

    expect(extractContractType(text)).toBe("주택용");
  });

  it("returns null when no keyword is present", () => {
    expect(extractContractType("계약종별: 알수없음")).toBeNull();
  });
});

describe("extractBillingMonth", () => {
  it("normalizes a Korean year-month label to YYYY-MM", () => {
    expect(extractBillingMonth("2017년 5월 청구서")).toBe("2017-05");
  });

  it("handles a double-digit month without extra padding", () => {
    expect(extractBillingMonth("2026년 12월분")).toBe("2026-12");
  });

  it("returns null when no date is present", () => {
    expect(extractBillingMonth("날짜 정보 없음")).toBeNull();
  });
});

describe("extractSupplyAddress", () => {
  it("extracts text following an address label", () => {
    expect(extractSupplyAddress("공급주소: 서울시 마포구 연남동 123-4")).toBe(
      "서울시 마포구 연남동 123-4",
    );
  });

  it("returns null when no address label is present", () => {
    expect(extractSupplyAddress("아무 내용")).toBeNull();
  });
});

describe("extractBillFields", () => {
  it("composes all fields and assigns the page confidence to matched fields", () => {
    const result = extractBillFields(
      "2026년 6월 청구서\n사용량 287 kWh 계약종별 일반용\n공급주소: 서울시 마포구 연남동 123-4",
      94.2,
    );

    expect(result.usageKwh).toEqual({ value: 287, confidence: 94.2 });
    expect(result.contractType).toEqual({ value: "일반용", confidence: 94.2 });
    expect(result.supplyAddress).toEqual({
      value: "서울시 마포구 연남동 123-4",
      confidence: 94.2,
    });
    expect(result.billingMonth).toEqual({
      value: "2026-06",
      confidence: 94.2,
    });
    expect(result.usageM3).toEqual({ value: null, confidence: 0 });
  });

  it("uses the matched word's own confidence instead of the whole-page confidence when word data is available", () => {
    const words = [
      { text: "사용량비교", confidence: 40 },
      { text: "당월", confidence: 55 },
      { text: "302", confidence: 98 },
      { text: "kWh", confidence: 91 },
      { text: "2017", confidence: 96 },
      { text: "5월", confidence: 89 },
    ];

    const result = extractBillFields(
      "2017년 5월\n사용량비교\n당월 302 kWh",
      60,
      words,
    );

    expect(result.usageKwh).toEqual({ value: 302, confidence: 98 });
    expect(result.billingMonth.value).toBe("2017-05");
    expect(result.billingMonth.confidence).toBeCloseTo((96 + 89) / 2);
  });

  it("falls back to the page confidence when no matching word is found", () => {
    const result = extractBillFields("사용량 287 kWh", 73, [
      { text: "unrelated", confidence: 12 },
    ]);

    expect(result.usageKwh).toEqual({ value: 287, confidence: 73 });
  });
});
