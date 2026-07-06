import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../../..')
const inputPath = path.join(rootDir, 'materials/past-papers/structured/zikaosw-preview-bank.json')
const outputPath = path.join(rootDir, 'src/data/zikaoswPreviewBank.ts')

const paperKeys = ['id', 'courseId', 'title', 'year', 'session', 'sourceKind', 'status', 'description', 'minutes', 'totalScore', 'questionIds']
const questionKeys = [
  'id',
  'courseId',
  'paperId',
  'type',
  'chapterId',
  'stem',
  'options',
  'answer',
  'analysis',
  'points',
  'difficulty',
  'sourceKind',
  'tags',
  'rubric',
]

function pick(object, keys) {
  return Object.fromEntries(keys.filter((key) => object[key] !== undefined).map((key) => [key, object[key]]))
}

function readBank() {
  const bank = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
  if (!Array.isArray(bank.papers) || !Array.isArray(bank.questions)) {
    throw new Error('zikaosw-preview-bank.json must contain papers and questions arrays.')
  }
  if (bank.totalQuestions !== bank.questions.length || bank.totalPapers !== bank.papers.length) {
    throw new Error('zikaosw preview bank totals do not match array lengths.')
  }
  const answeredCount = bank.questions.filter((question) => Array.isArray(question.answer) && !question.answer.includes('待补充答案')).length
  if (answeredCount !== bank.questions.length) {
    throw new Error(`zikaosw preview bank still has missing answers: ${bank.questions.length - answeredCount}`)
  }
  return bank
}

function buildOutput(bank) {
  const papers = bank.papers.map((paper) => pick(paper, paperKeys))
  const questions = bank.questions.map((question) => pick(question, questionKeys))

  return `import type { Paper, Question } from '../types'

// 由 materials/past-papers/tools/build-zikaosw-preview-app-bank.mjs 生成。
// 旧年份资料每套只有 15 道公开预览题，不作为完整真题自动加载。
export const zikaoswPreviewPapers = ${JSON.stringify(papers, null, 2)} satisfies Paper[]

export const zikaoswPreviewQuestions = ${JSON.stringify(questions, null, 2)} satisfies Question[]
`
}

const bank = readBank()
fs.writeFileSync(outputPath, buildOutput(bank))
console.log(`Wrote ${outputPath}`)
console.log(`${bank.papers.length} papers / ${bank.questions.length} questions`)
