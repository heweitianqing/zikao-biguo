import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const queuePath = path.join(rootDir, 'index', 'zikaosw-answer-queue.json')
const outputPath = path.join(rootDir, 'index', 'zikaosw-answer-fetch-results.json')

const cookie = process.env.ZIKAOSW_COOKIE?.trim()
const limit = Number.parseInt(process.env.ZIKAOSW_LIMIT ?? '', 10)
const offset = Number.parseInt(process.env.ZIKAOSW_OFFSET ?? '0', 10)
const delayMs = Number.parseInt(process.env.ZIKAOSW_DELAY_MS ?? '800', 10)

if (!cookie) {
  console.error('缺少 ZIKAOSW_COOKIE。请先登录并确认账号有查看答案权限，再把浏览器 Cookie 放到环境变量里运行。')
  process.exit(1)
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'))
const records = queue.records.slice(offset, Number.isFinite(limit) ? offset + limit : undefined)
const results = []

for (const [index, record] of records.entries()) {
  const body = new URLSearchParams({ id: record.answerId })
  const response = await fetch(queue.endpoint, {
    method: queue.method,
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      cookie,
      origin: 'https://www.zikaosw.cn',
      referer: record.answerUrl,
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome Safari',
      'x-requested-with': 'XMLHttpRequest',
    },
    body,
  })

  const rawText = await response.text()
  let payload = null
  try {
    payload = JSON.parse(rawText)
  } catch {
    payload = null
  }

  const answer = payload?.data?.answer
  results.push({
    ...record,
    fetchedAt: new Date().toISOString(),
    httpStatus: response.status,
    success: payload?.code === 200 && Boolean(answer),
    responseCode: payload?.code ?? null,
    message: payload?.msg ?? '',
    answer: normalizeText(answer?.answer),
    analysis: normalizeText(answer?.analysis),
  })

  console.log(`${offset + index + 1}/${queue.total} ${record.answerId}: ${payload?.code ?? response.status}`)
  if (index < records.length - 1 && delayMs > 0) {
    await sleep(delayMs)
  }
}

fs.writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      updatedAt: new Date().toISOString(),
      sourceQueue: path.relative(rootDir, queuePath),
      totalRequested: records.length,
      totalSuccess: results.filter((result) => result.success).length,
      records: results,
    },
    null,
    2,
  )}\n`,
)

console.log(`Saved ${results.length} fetch results to ${path.relative(rootDir, outputPath)}.`)
