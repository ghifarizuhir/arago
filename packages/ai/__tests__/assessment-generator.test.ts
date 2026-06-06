import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockLanguageModelV1 } from "ai/test";
import { AssessmentOutputSchema } from "../src/schemas";
import type { LanguageModelV1 } from "ai";

const VALID_ASSESSMENT = {
  title: "Photosynthesis Quiz",
  description: "A quiz on photosynthesis",
  items: [
    {
      itemType: "multiple_choice" as const,
      prompt: "What is photosynthesis?",
      options: [
        "The process by which plants make food",
        "The process by which animals breathe",
        "The process by which water freezes",
        "The process by which rocks form",
      ],
      correctAnswer: "The process by which plants make food",
      points: 1,
      explanation: "Photosynthesis is the process plants use to convert sunlight into energy.",
    },
  ],
};

const SHORT_ANSWER_ASSESSMENT = {
  title: "Cell Biology",
  items: [
    {
      itemType: "short_answer" as const,
      prompt: "What is the powerhouse of the cell?",
      correctAnswer: "Mitochondria",
      points: 2,
      explanation: "Mitochondria produce ATP through cellular respiration.",
    },
  ],
};

function createMockModel(response: unknown) {
  return new MockLanguageModelV1({
    doGenerate: async () => ({
      rawCall: { rawPrompt: "test", rawSettings: {} },
      finishReason: "stop" as const,
      usage: { promptTokens: 10, completionTokens: 20 },
      text: JSON.stringify(response),
    }),
    defaultObjectGenerationMode: "json",
    supportsStructuredOutputs: true,
  });
}

function createFailingMockModel(errorCount: number, finalResponse: unknown) {
  let calls = 0;
  return new MockLanguageModelV1({
    doGenerate: async () => {
      calls++;
      if (calls <= errorCount) {
        return {
          rawCall: { rawPrompt: "test", rawSettings: {} },
          finishReason: "stop" as const,
          usage: { promptTokens: 10, completionTokens: 20 },
          text: JSON.stringify({ invalid: "data" }),
        };
      }
      return {
        rawCall: { rawPrompt: "test", rawSettings: {} },
        finishReason: "stop" as const,
        usage: { promptTokens: 10, completionTokens: 20 },
        text: JSON.stringify(finalResponse),
      };
    },
    defaultObjectGenerationMode: "json",
    supportsStructuredOutputs: true,
  });
}

function createAlwaysFailingMockModel() {
  return new MockLanguageModelV1({
    doGenerate: async () => ({
      rawCall: { rawPrompt: "test", rawSettings: {} },
      finishReason: "stop" as const,
      usage: { promptTokens: 10, completionTokens: 20 },
      text: JSON.stringify({ invalid: "data" }),
    }),
    defaultObjectGenerationMode: "json",
    supportsStructuredOutputs: true,
  });
}

let mockGetModel: ReturnType<typeof vi.fn>;

vi.mock("../src/providers", () => ({
  getModel: (...args: unknown[]) => mockGetModel(...args),
  setProvider: vi.fn(),
  getProvider: vi.fn(() => "openai"),
}));

import { generateAssessment } from "../src/assessment-generator";
import { setProvider, getProvider, getModel } from "../src/providers";

describe("AssessmentOutputSchema", () => {
  it("validates a correct assessment with multiple choice items", () => {
    const result = AssessmentOutputSchema.safeParse(VALID_ASSESSMENT);
    expect(result.success).toBe(true);
  });

  it("validates a correct assessment with short answer items", () => {
    const result = AssessmentOutputSchema.safeParse(SHORT_ANSWER_ASSESSMENT);
    expect(result.success).toBe(true);
  });

  it("rejects assessment with no items", () => {
    const result = AssessmentOutputSchema.safeParse({
      title: "Empty Quiz",
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects assessment missing title", () => {
    const result = AssessmentOutputSchema.safeParse({
      items: [VALID_ASSESSMENT.items[0]],
    });
    expect(result.success).toBe(false);
  });

  it("rejects item with empty prompt", () => {
    const result = AssessmentOutputSchema.safeParse({
      title: "Bad Quiz",
      items: [{ ...VALID_ASSESSMENT.items[0], prompt: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects item with empty correctAnswer", () => {
    const result = AssessmentOutputSchema.safeParse({
      title: "Bad Quiz",
      items: [{ ...VALID_ASSESSMENT.items[0], correctAnswer: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts item without optional fields", () => {
    const minimalItem = {
      itemType: "short_answer" as const,
      prompt: "Name the largest planet",
      correctAnswer: "Jupiter",
      points: 1,
    };
    const result = AssessmentOutputSchema.safeParse({
      title: "Astronomy Quiz",
      items: [minimalItem],
    });
    expect(result.success).toBe(true);
  });

  it("defaults points to 1 when omitted", () => {
    const item = {
      itemType: "multiple_choice" as const,
      prompt: "What color is the sky?",
      options: ["Blue", "Red", "Green", "Yellow"],
      correctAnswer: "Blue",
    };
    const result = AssessmentOutputSchema.safeParse({
      title: "Colors Quiz",
      items: [item],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items[0].points).toBe(1);
    }
  });
});

describe("generateAssessment", () => {
  beforeEach(() => {
    mockGetModel = vi.fn().mockReturnValue(createMockModel(VALID_ASSESSMENT));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("produces valid structured output matching Zod schema", async () => {
    const result = await generateAssessment({ topic: "Photosynthesis" });

    expect(result).toMatchObject({
      title: expect.any(String),
      items: expect.arrayContaining([
        expect.objectContaining({
          itemType: expect.stringMatching(/multiple_choice|short_answer/),
          prompt: expect.any(String),
          correctAnswer: expect.any(String),
        }),
      ]),
    });

    const parsed = AssessmentOutputSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("passes topic and parameters to the model", async () => {
    const mockModel = createMockModel(VALID_ASSESSMENT);
    const doGenerateSpy = vi.spyOn(mockModel, "doGenerate");
    mockGetModel.mockReturnValue(mockModel);

    await generateAssessment({
      topic: "Cell Biology",
      itemCount: 3,
      difficulty: "hard",
      gradeLevel: 10,
      subject: "Science",
    });

    expect(doGenerateSpy).toHaveBeenCalled();
  });

  it("succeeds on second attempt after validation failure", async () => {
    const model = createFailingMockModel(1, VALID_ASSESSMENT);
    mockGetModel.mockReturnValue(model);

    const result = await generateAssessment({ topic: "Photosynthesis" });

    expect(result).toBeDefined();
    const parsed = AssessmentOutputSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("succeeds on final attempt after retries", async () => {
    const model = createFailingMockModel(2, VALID_ASSESSMENT);
    mockGetModel.mockReturnValue(model);

    const result = await generateAssessment({ topic: "Photosynthesis" });
    const parsed = AssessmentOutputSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("throws after exhausting all retries", async () => {
    mockGetModel.mockReturnValue(createAlwaysFailingMockModel());

    await expect(
      generateAssessment({ topic: "Photosynthesis" })
    ).rejects.toThrow(/failed after 3 attempts/);
  });

  it("works with short_answer item types", async () => {
    mockGetModel.mockReturnValue(createMockModel(SHORT_ANSWER_ASSESSMENT));

    const result = await generateAssessment({
      topic: "Cell Biology",
      itemTypes: ["short_answer"],
    });

    const parsed = AssessmentOutputSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("works with mixed item types", async () => {
    const mixedAssessment = {
      title: "Mixed Quiz",
      items: [
        VALID_ASSESSMENT.items[0],
        SHORT_ANSWER_ASSESSMENT.items[0],
      ],
    };
    mockGetModel.mockReturnValue(createMockModel(mixedAssessment));

    const result = await generateAssessment({
      topic: "Biology",
      itemTypes: ["multiple_choice", "short_answer"],
    });

    const parsed = AssessmentOutputSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });
});

describe("Provider switching", () => {
  beforeEach(() => {
    mockGetModel = vi.fn().mockReturnValue(createMockModel(VALID_ASSESSMENT));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to openai provider", () => {
    expect(getProvider()).toBe("openai");
  });

  it("switches to anthropic provider", () => {
    setProvider("anthropic");
    expect(getProvider()).toHaveBeenCalled;
  });

  it("switches back to openai", () => {
    setProvider("anthropic");
    setProvider("openai");
    expect(getProvider()).toHaveBeenCalled;
  });

  it("generates assessment with anthropic provider", async () => {
    setProvider("anthropic");
    const mockModel = createMockModel(VALID_ASSESSMENT);
    mockGetModel.mockReturnValue(mockModel);

    const result = await generateAssessment({ topic: "Physics" });
    const parsed = AssessmentOutputSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("generates assessment with openai provider", async () => {
    setProvider("openai");
    const mockModel = createMockModel(VALID_ASSESSMENT);
    mockGetModel.mockReturnValue(mockModel);

    const result = await generateAssessment({ topic: "Chemistry" });
    const parsed = AssessmentOutputSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("model is resolved dynamically based on current provider", async () => {
    const openaiModel = createMockModel({ ...VALID_ASSESSMENT, title: "OpenAI Quiz" });
    const anthropicModel = createMockModel({ ...VALID_ASSESSMENT, title: "Anthropic Quiz" });

    setProvider("openai");
    mockGetModel.mockReturnValue(openaiModel);
    const result1 = await generateAssessment({ topic: "Test 1" });
    expect(result1.title).toBe("OpenAI Quiz");

    setProvider("anthropic");
    mockGetModel.mockReturnValue(anthropicModel);
    const result2 = await generateAssessment({ topic: "Test 2" });
    expect(result2.title).toBe("Anthropic Quiz");
  });
});