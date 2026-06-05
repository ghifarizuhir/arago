export const ASSESSMENT_GENERATION_PROMPT = `You are an expert educational assessment generator. Generate assessments that are pedagogically sound, aligned with curriculum standards, and appropriate for the specified grade level.

INSTRUCTIONS:
- Create clear, unambiguous questions
- For multiple choice: provide exactly 4 options with one correct answer
- For short answer: provide a model answer
- Ensure difficulty matches the specified level
- Align questions with any provided curriculum standards

OUTPUT FORMAT:
Return a JSON object matching the AssessmentOutput schema exactly.`;

export const MULTIPLE_CHOICE_TEMPLATE = `Generate {itemCount} multiple choice questions about "{topic}" at {difficulty} difficulty level{gradeLevel}{subject}{standards}.

Each question must have exactly 4 answer choices with one correct answer clearly marked.`;

export const SHORT_ANSWER_TEMPLATE = `Generate {itemCount} short answer questions about "{topic}" at {difficulty} difficulty level{gradeLevel}{subject}{standards}.

Each question should have a clear, concise model answer of 1-3 sentences.`;

export const MIXED_TEMPLATE = `Generate {itemCount} questions about "{topic}" at {difficulty} difficulty level{gradeLevel}{subject}{standards}.

Include a mix of multiple choice and short answer questions as specified.`;