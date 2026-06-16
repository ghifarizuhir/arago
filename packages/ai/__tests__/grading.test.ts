import { describe, it, expect } from 'vitest'
import { gradeSubmission } from '../src/grading'

describe('gradeSubmission', () => {
  const items = [
    { id: 'q1', correctAnswer: 'a' },
    { id: 'q2', correctAnswer: 'b' },
    { id: 'q3', correctAnswer: 'c' },
    { id: 'q4', correctAnswer: 'd' },
  ]

  it('returns 100 when all answers are correct', () => {
    const result = gradeSubmission(items, { q1: 'a', q2: 'b', q3: 'c', q4: 'd' })
    expect(result.score).toBe(100)
    expect(result.correctCount).toBe(4)
    expect(result.totalItems).toBe(4)
  })

  it('returns 0 when all answers are wrong', () => {
    const result = gradeSubmission(items, { q1: 'b', q2: 'c', q3: 'd', q4: 'a' })
    expect(result.score).toBe(0)
    expect(result.correctCount).toBe(0)
  })

  it('returns 50 when half answers are correct', () => {
    const result = gradeSubmission(items, { q1: 'a', q2: 'b', q3: 'x', q4: 'x' })
    expect(result.score).toBe(50)
    expect(result.correctCount).toBe(2)
  })

  it('treats unanswered items as incorrect', () => {
    const result = gradeSubmission(items, { q1: 'a' })
    expect(result.score).toBe(25)
    expect(result.correctCount).toBe(1)
  })

  it('rounds score correctly (1/3 → 33)', () => {
    const threeItems = [
      { id: 'q1', correctAnswer: 'a' },
      { id: 'q2', correctAnswer: 'b' },
      { id: 'q3', correctAnswer: 'c' },
    ]
    const result = gradeSubmission(threeItems, { q1: 'a' })
    expect(result.score).toBe(33)
  })

  it('returns 0 when items array is empty', () => {
    const result = gradeSubmission([], {})
    expect(result.score).toBe(0)
    expect(result.totalItems).toBe(0)
  })
})
