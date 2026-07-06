import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../../..')
const banks = [
  {
    name: 'generated',
    path: path.join(rootDir, 'materials/past-papers/structured/generated-import-bank.json'),
    expectedPapers: 19,
    expectedQuestions: 195,
  },
  {
    name: 'zikaosw-preview',
    path: path.join(rootDir, 'materials/past-papers/structured/zikaosw-preview-bank.json'),
    expectedPapers: 24,
    expectedQuestions: 360,
  },
]

const noisePatterns = [
  /[一二三四五六七八九十]+[、.．]\s*(单项选择题|多项选择题|简答题|论述题)/,
  /^(单项选择题|多项选择题|简答题|论述题)\s*[:：]?$/,
  /(?:\d{4}\s*)?年\s*\d{1,2}\s*月\s*自学考试/,
  /课程代码\s*[:：]?/,
  /答案及解析/,
  /【考点】/,
  /咨询热线|微信扫码|免费约直播|扫码刷题|查看答案|开通搜题包/,
]

function checkBank({ name, path: bankPath, expectedPapers, expectedQuestions }) {
  const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'))
  const issues = []
  const papers = bank.papers ?? []
  const questions = bank.questions ?? []

  if (papers.length !== expectedPapers) {
    issues.push({ id: name, field: 'papers.length', value: papers.length, expected: expectedPapers })
  }
  if (questions.length !== expectedQuestions) {
    issues.push({ id: name, field: 'questions.length', value: questions.length, expected: expectedQuestions })
  }

  const questionIds = new Set(questions.map((question) => question.id))
  const paperIds = new Set(papers.map((paper) => paper.id))

  for (const paper of papers) {
    if (!paper.questionIds?.length) {
      issues.push({ id: paper.id, field: 'questionIds', value: 'empty paper' })
    }
    for (const questionId of paper.questionIds ?? []) {
      if (!questionIds.has(questionId)) {
        issues.push({ id: paper.id, field: 'questionIds', value: `missing question ${questionId}` })
      }
    }
  }

  for (const question of questions) {
    if (!paperIds.has(question.paperId)) {
      issues.push({ id: question.id, field: 'paperId', value: `missing paper ${question.paperId}` })
    }
    if (!Array.isArray(question.answer) || !question.answer.length || question.answer.includes('待补充答案')) {
      issues.push({ id: question.id, field: 'answer', value: question.answer })
    }
    if ((question.type === 'single' || question.type === 'multiple') && (!Array.isArray(question.options) || question.options.length < 2)) {
      issues.push({ id: question.id, field: 'options', value: question.options })
    }

    const fields = [
      ['stem', question.stem],
      ['analysis', question.analysis],
      ...(question.answer ?? []).map((item, index) => [`answer[${index}]`, item]),
      ...(question.rubric ?? []).map((item, index) => [`rubric[${index}]`, item]),
    ]
    for (const [field, value] of fields) {
      if (typeof value === 'string' && noisePatterns.some((pattern) => pattern.test(value.trim()))) {
        issues.push({ id: question.id, field, value })
      }
    }
  }

  return {
    name,
    papers: papers.length,
    questions: questions.length,
    issueCount: issues.length,
    issues,
  }
}

const results = banks.map((bank) => checkBank(bank))
const issues = results.flatMap((result) => result.issues.map((issue) => ({ bank: result.name, ...issue })))

if (issues.length) {
  console.error(JSON.stringify({ issueCount: issues.length, issues: issues.slice(0, 50) }, null, 2))
  process.exit(1)
}

console.log(
  JSON.stringify(
    {
      banks: results.map(({ name, papers, questions, issueCount }) => ({ name, papers, questions, issueCount })),
      issueCount: 0,
    },
    null,
    2,
  ),
)
