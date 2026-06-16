export type AssessmentItemForGrading = {
  id: string
  correctAnswer: string
}

export type AnswerMap = Record<string, string> // itemId -> choiceId

export type GradingResult = {
  score: number       // 0-100
  correctCount: number
  totalItems: number
}

export function gradeSubmission(
  items: AssessmentItemForGrading[],
  answers: AnswerMap,
): GradingResult {
  if (items.length === 0) {
    return { score: 0, correctCount: 0, totalItems: 0 }
  }
  const correctCount = items.filter(
    (item) => answers[item.id] === item.correctAnswer,
  ).length
  const score = Math.round((correctCount / items.length) * 100)
  return { score, correctCount, totalItems: items.length }
}
