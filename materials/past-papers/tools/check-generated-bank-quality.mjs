import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../../..')
const bankPath = path.join(rootDir, 'materials/past-papers/structured/generated-import-bank.json')

const noisePatterns = [
  /[一二三四五六七八九十]+[、.．]\s*(单项选择题|多项选择题|简答题|论述题)/,
  /^(单项选择题|多项选择题|简答题|论述题)\s*[:：]?$/,
  /(?:\d{4}\s*)?年\s*\d{1,2}\s*月\s*自学考试/,
  /课程代码\s*[:：]?/,
  /答案及解析/,
  /【考点】/,
  /咨询热线|微信扫码|免费约直播|扫码刷题/,
]

const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'))
const issues = []

for (const paper of bank.papers ?? []) {
  if (!paper.questionIds?.length) {
    issues.push({ id: paper.id, field: 'questionIds', value: 'empty paper' })
  }
}

for (const question of bank.questions ?? []) {
  if (!Array.isArray(question.answer) || !question.answer.length || question.answer.includes('待补充答案')) {
    issues.push({ id: question.id, field: 'answer', value: question.answer })
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

if (issues.length) {
  console.error(JSON.stringify({ issueCount: issues.length, issues: issues.slice(0, 50) }, null, 2))
  process.exit(1)
}

console.log(
  JSON.stringify(
    {
      papers: bank.papers?.length ?? 0,
      questions: bank.questions?.length ?? 0,
      issueCount: 0,
    },
    null,
    2,
  ),
)
