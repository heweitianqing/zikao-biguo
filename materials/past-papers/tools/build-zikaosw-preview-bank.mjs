import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const olderIndexPath = path.join(rootDir, 'index', 'older-web-pages.json')
const queuePath = path.join(rootDir, 'index', 'zikaosw-answer-queue.json')
const answerResultsPath = path.join(rootDir, 'index', 'zikaosw-answer-fetch-results.json')
const outputPath = path.join(rootDir, 'structured', 'zikaosw-preview-bank.json')

const courseMeta = {
  history: {
    code: '15043',
    name: '中国近现代史纲要',
    minutes: 150,
    chapters: {
      'history-1': ['鸦片战争', '反侵略', '三元里', '近代社会', '主要矛盾', '历史任务'],
      'history-2': ['太平天国', '洋务运动', '戊戌', '辛亥', '孙中山', '同盟会', '保路运动'],
      'history-3': ['五四', '中国共产党', '土地革命', '抗日', '解放战争', '井冈山', '国共合作'],
      'history-4': ['新中国', '社会主义改造', '改革开放', '十一届三中全会', '新时代', '联合国'],
    },
  },
  marx: {
    code: '15044',
    name: '马克思主义基本原理',
    minutes: 150,
    chapters: {
      'marx-0': ['马克思主义', '科学性', '革命性', '时代产物', '空想社会主义'],
      'marx-1': ['物质', '意识', '实践', '规律', '矛盾', '辩证法', '运动', '静止'],
      'marx-2': ['认识', '真理', '谬误', '价值', '感性认识', '理性认识'],
      'marx-3': ['社会存在', '社会意识', '人民群众', '生产方式', '社会基本矛盾', '阶级斗争'],
      'marx-4': ['商品', '价值', '剩余价值', '资本', '垄断', '社会主义', '共产主义'],
    },
  },
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function sessionSlug(session) {
  return session.replace('月', '').padStart(2, '0')
}

function formatSession(session) {
  return session.replace('月', ' 月')
}

function paperIdFor(record) {
  return `zikaosw-${record.courseId}-${record.year}-${sessionSlug(record.session)}-preview`
}

function answerIdFromUrl(url) {
  return url.match(/\/daan\/(\d+)\.html/)?.[1] ?? ''
}

function cleanStem(value) {
  return normalizeText(value)
    .replace(/^\d{1,2}[、.．]\s*/, '')
    .replace(/\s+/g, ' ')
    .replace(/[。；;：:]+$/, '')
    .trim()
}

function cleanOption(value) {
  return normalizeText(value).replace(/\s+/g, ' ').trim()
}

function parseFetchedChoice(answerText) {
  const normalized = String(answerText ?? '').toUpperCase()
  const labeled = normalized.match(/(?:答案|正确答案|参考答案)\s*[:：]?\s*([A-H](?:\s*[,，、和及]\s*[A-H])*)/)
  const source = labeled?.[1] ?? normalized
  const letters = [...source.matchAll(/[A-H]/g)].map((match) => match[0])
  return [...new Set(letters)]
}

function splitSubjectiveAnswer(answerText) {
  const raw = normalizeText(answerText)
  if (!raw) {
    return []
  }

  const parts = raw.split(/\n+|；|;|(?=（\d+）)|(?=\(\d+\))|(?=\d+[、.．]\s*)/)
  const cleaned = parts
    .map((part) => part.replace(/^[\s\d()（）、.．]+/, '').trim())
    .filter((part) => part.length >= 2)
  return cleaned.length ? cleaned.slice(0, 10) : [raw]
}

function inferChapter(courseId, stem, answerText) {
  const meta = courseMeta[courseId]
  const haystack = `${stem}${answerText}`.replace(/\s/g, '')
  let bestChapter = Object.keys(meta.chapters)[0]
  let bestScore = -1
  for (const [chapterId, keywords] of Object.entries(meta.chapters)) {
    const score = keywords.filter((keyword) => haystack.includes(keyword.replace(/\s/g, ''))).length
    if (score > bestScore) {
      bestChapter = chapterId
      bestScore = score
    }
  }
  return bestChapter
}

function parseOptions(frontText) {
  const matches = [...frontText.matchAll(/^([A-H])[.、．]\s*/gm)]
  if (matches.length < 2) {
    return { stem: cleanStem(frontText), options: [] }
  }

  const stem = cleanStem(frontText.slice(0, matches[0].index))
  const options = matches.map((match, index) => {
    const start = match.index + match[0].length
    const end = index + 1 < matches.length ? matches[index + 1].index : frontText.length
    return cleanOption(frontText.slice(start, end))
  })

  return { stem, options }
}

function parseTextFile(record) {
  const textPath = path.join(rootDir, record.textFile)
  const text = fs.readFileSync(textPath, 'utf8')
  const body = normalizeText(text.split('## 正文')[1] ?? text)
  const endIndex = body.search(/\[更多本套试题入口|题库训练|相关推荐/)
  const scoped = endIndex >= 0 ? body.slice(0, endIndex) : body
  const matches = [...scoped.matchAll(/^(\d{1,2})[、.．]\s*/gm)]
  const questions = []

  for (const [index, match] of matches.entries()) {
    const questionNo = Number(match[1])
    const start = match.index
    const end = index + 1 < matches.length ? matches[index + 1].index : scoped.length
    const block = normalizeText(scoped.slice(start, end))
    const answerUrl = block.match(/\[答案入口：(https:\/\/www\.zikaosw\.cn\/daan\/\d+\.html)\]/)?.[1] ?? ''
    const front = normalizeText(block.replace(/\[答案入口：https:\/\/www\.zikaosw\.cn\/daan\/\d+\.html\]/, ''))
    const { stem, options } = parseOptions(front)
    if (!stem || !answerUrl) {
      continue
    }
    questions.push({ questionNo, stem, options, answerUrl, answerId: answerIdFromUrl(answerUrl) })
  }

  return questions
}

function buildAnswersById(payload) {
  const answersById = new Map()
  for (const record of payload.records ?? []) {
    answersById.set(record.answerId, record)
  }
  return answersById
}

const olderIndex = readJson(olderIndexPath)
const queue = readJson(queuePath)
const queueByAnswerId = new Map(queue.records.map((record) => [record.answerId, record]))
const answerResults = readJson(answerResultsPath, { records: [] })
const answersById = buildAnswersById(answerResults)

const papers = []
const questions = []
const parseWarnings = []

for (const sourceRecord of olderIndex.records) {
  const parsedQuestions = parseTextFile(sourceRecord)
  const paperId = paperIdFor(sourceRecord)
  const paperQuestionIds = []

  for (const parsed of parsedQuestions) {
    const queueRecord = queueByAnswerId.get(parsed.answerId)
    const fetched = answersById.get(parsed.answerId)
    const hasFetchedAnswer = Boolean(fetched?.success && (fetched.answer || fetched.analysis))
    const answer =
      parsed.options.length > 0
        ? hasFetchedAnswer
          ? parseFetchedChoice(fetched.answer)
          : []
        : hasFetchedAnswer
          ? splitSubjectiveAnswer(fetched.answer)
          : []
    const normalizedAnswer = answer.length ? answer : ['待补充答案']
    const questionType = parsed.options.length > 0 ? (normalizedAnswer.length > 1 ? 'multiple' : 'single') : 'short'
    const questionId = `${paperId}-q${String(parsed.questionNo).padStart(3, '0')}`
    paperQuestionIds.push(questionId)
    questions.push({
      id: questionId,
      courseId: sourceRecord.courseId,
      paperId,
      type: questionType,
      chapterId: inferChapter(sourceRecord.courseId, parsed.stem, fetched?.answer ?? ''),
      stem: parsed.stem,
      ...(parsed.options.length ? { options: parsed.options } : {}),
      answer: normalizedAnswer,
      analysis: normalizeText(fetched?.analysis) || '自考生网页预览题，答案和解析待登录抓取后补齐。',
      points: questionType === 'multiple' ? 4 : 2,
      difficulty: '易',
      sourceKind: 'imported',
      tags: [
        '真题预览',
        '自考生网',
        `${sourceRecord.year}年${sourceRecord.session}`,
        sourceRecord.legacyCode,
        ...(hasFetchedAnswer ? ['已抓答案'] : ['待抓答案']),
      ],
      source: {
        answerId: parsed.answerId,
        answerUrl: parsed.answerUrl,
        sourceUrl: sourceRecord.sourceUrl,
        textFile: sourceRecord.textFile,
        accessStatus: queueRecord?.accessStatus ?? sourceRecord.answerStatus,
      },
    })
  }

  const answeredCount = paperQuestionIds.filter((questionId) => {
    const question = questions.find((item) => item.id === questionId)
    return question && !question.answer.includes('待补充答案')
  }).length
  if (paperQuestionIds.length !== sourceRecord.visibleQuestionCount) {
    parseWarnings.push({
      paperId,
      expected: sourceRecord.visibleQuestionCount,
      actual: paperQuestionIds.length,
      textFile: sourceRecord.textFile,
    })
  }

  const meta = courseMeta[sourceRecord.courseId]
  papers.push({
    id: paperId,
    courseId: sourceRecord.courseId,
    title: `${sourceRecord.code}/${sourceRecord.legacyCode} ${sourceRecord.year} 年 ${formatSession(sourceRecord.session)}预览题`,
    year: sourceRecord.year,
    session: sourceRecord.session,
    sourceKind: 'imported',
    status: answeredCount === paperQuestionIds.length ? 'ready' : 'needs-import',
    description: `自考生网旧年份公开预览题，仅 ${paperQuestionIds.length} 道；${answeredCount} 道已有抓取答案，完整卷仍需 PDF 或付费/登录来源补齐。`,
    minutes: meta.minutes,
    totalScore: paperQuestionIds.length * 2,
    questionIds: paperQuestionIds,
  })
}

const output = {
  updatedAt: answerResults.updatedAt ?? olderIndex.updatedAt ?? queue.updatedAt ?? new Date().toISOString(),
  sourceIndex: path.relative(rootDir, olderIndexPath),
  sourceQueue: path.relative(rootDir, queuePath),
  answerResults: fs.existsSync(answerResultsPath) ? path.relative(rootDir, answerResultsPath) : null,
  totalPapers: papers.length,
  totalQuestions: questions.length,
  totalWithAnswers: questions.filter((question) => !question.answer.includes('待补充答案')).length,
  parseWarnings,
  note: '这是旧年份公开预览题的结构化草稿。未抓到答案的题不会接入正式刷题入口，登录抓取答案后可重新生成。',
  papers,
  questions,
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')

console.log(
  `Saved ${output.totalPapers} papers / ${output.totalQuestions} questions / ${output.totalWithAnswers} answered to ${path.relative(
    rootDir,
    outputPath,
  )}.`,
)
if (parseWarnings.length) {
  console.warn(`Parse warnings: ${parseWarnings.length}`)
}
