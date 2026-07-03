import type { AnswerRecord, Paper, Question } from '../types'

export function questionLabel(type: Question['type']) {
  const labels = {
    single: '单选',
    multiple: '多选',
    short: '简答',
    essay: '论述',
  }
  return labels[type]
}

export function sourceLabel(kind: Question['sourceKind'] | Paper['sourceKind']) {
  const labels = {
    'official-outline': '官方大纲',
    'outline-sample': '大纲样卷',
    mock: '模拟训练',
    imported: '本地导入',
    index: '真题索引',
  }
  return labels[kind]
}

export function normalizeChoice(answer: string[]) {
  return [...answer].map((item) => item.trim().toUpperCase()).sort()
}

export function scoreObjective(question: Question, answer: string[]) {
  const expected = normalizeChoice(question.answer)
  const actual = normalizeChoice(answer)
  const isCorrect = expected.length === actual.length && expected.every((item, index) => item === actual[index])
  return isCorrect ? question.points : 0
}

export function scoreTextAnswer(question: Question, textAnswer: string) {
  const cleanAnswer = textAnswer.trim()
  if (!cleanAnswer) {
    return 0
  }

  const haystack = cleanAnswer.replace(/\s/g, '')
  const hits = question.answer.filter((item) => haystack.includes(item.replace(/\s/g, '').slice(0, 8))).length
  const rubricHits = question.rubric?.filter((item) => haystack.includes(item.replace(/\s/g, '').slice(0, 4))).length ?? 0
  const basis = Math.max(question.answer.length + (question.rubric?.length ?? 0), 1)
  const ratio = Math.min((hits + rubricHits) / basis, 1)
  const lengthBonus = cleanAnswer.length > 80 ? 0.12 : cleanAnswer.length > 35 ? 0.06 : 0

  return Math.min(question.points, Math.round(question.points * Math.min(ratio + lengthBonus, 0.92)))
}

export function getQuestionScore(question: Question, record?: AnswerRecord) {
  if (!record) {
    return 0
  }
  if (question.type === 'single' || question.type === 'multiple') {
    return scoreObjective(question, record.answer)
  }
  return record.earned
}

export function calculatePaperScore(paper: Paper, questions: Question[], answers: Record<string, AnswerRecord>) {
  return paper.questionIds.reduce((sum, id) => {
    const question = questions.find((item) => item.id === id)
    return question ? sum + getQuestionScore(question, answers[id]) : sum
  }, 0)
}

export function getQuestionStatus(question: Question, record?: AnswerRecord) {
  if (!record) {
    return '未答'
  }
  const earned = getQuestionScore(question, record)
  if (earned >= question.points) {
    return '正确'
  }
  if (earned > 0) {
    return '部分得分'
  }
  return '待复盘'
}
