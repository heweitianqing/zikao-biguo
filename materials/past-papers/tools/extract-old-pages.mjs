import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const pagesDir = path.join(rootDir, 'pages', 'older')
const textDir = path.join(rootDir, 'text', 'older')
const indexDir = path.join(rootDir, 'index')
const updatedAt = '2026-07-05'

const sourceIds = {
  'marx-2016-04.html': '3934607',
  'marx-2016-10.html': '3932253',
  'marx-2017-04.html': '3934608',
  'marx-2017-10.html': '3932249',
  'marx-2018-04.html': '3932247',
  'marx-2018-10.html': '3932245',
  'marx-2019-04.html': '3934606',
  'marx-2019-10.html': '3932859',
  'marx-2020-08.html': '3935985',
  'marx-2020-10.html': '3942294',
  'marx-2021-04.html': '3942776',
  'marx-2021-10.html': '3943885',
  'history-2016-04.html': '3934612',
  'history-2016-10.html': '3932907',
  'history-2017-04.html': '3932269',
  'history-2017-10.html': '3932383',
  'history-2018-04.html': '3932271',
  'history-2018-10.html': '3932266',
  'history-2019-04.html': '3934611',
  'history-2019-10.html': '3934610',
  'history-2020-08.html': '3935984',
  'history-2020-10.html': '3940784',
  'history-2021-04.html': '3942617',
  'history-2021-10.html': '3943892',
}

const courseMap = {
  marx: {
    courseId: 'marx',
    code: '15044',
    legacyCode: '03709',
    name: '马克思主义基本原理',
  },
  history: {
    courseId: 'history',
    code: '15043',
    legacyCode: '03708',
    name: '中国近现代史纲要',
  },
}

fs.mkdirSync(textDir, { recursive: true })
fs.mkdirSync(indexDir, { recursive: true })

function decodeHtml(value) {
  return value
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
}

function stripHtml(value) {
  const stripped = value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<a\b[^>]*class=["'][^"']*blue_btn[^"']*["'][^>]*>\s*模拟考场\s*<\/a>/gi, '')
    .replace(
      /<a\b[^>]*href=["']([^"']*\/kaoshi\/sub-[^"']*)["'][^>]*class=["'][^"']*yellow_btn[^"']*["'][^>]*>\s*更多本套试题及答案[\s\S]*?<\/a>/gi,
      (_, href) => {
        const url = href.startsWith('http') ? href : `https://www.zikaosw.cn${href}`
        return `\n[更多本套试题入口：${url}]\n`
      },
    )
    .replace(/<a\b[^>]*href=["']([^"']*\/daan\/[^"']*)["'][^>]*>\s*查看答案\s*<\/a>/gi, (_, href) => {
      const url = href.startsWith('http') ? href : `https://www.zikaosw.cn${href}`
      return `\n[答案入口：${url}]\n`
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h1|h2|h3|h4|li|div|section|table|tr)>/gi, '\n')
    .replace(/<(p|h1|h2|h3|h4|li|tr|td|th)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')

  return decodeHtml(stripped)
    .replace(/\r/g, '')
    .replace(/^[ \t]*模拟考场[ \t]*$/gm, '')
    .replace(/^[\t \u00a0\u3000]+$/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function getFirstMatch(html, regex) {
  const match = html.match(regex)
  return match ? decodeHtml(match[1].replace(/<[^>]+>/g, '').trim()) : ''
}

function extractContent(html) {
  const match = html.match(/<div id=["']content-detail["'][^>]*>([\s\S]*?)<div class=["']content_bottom["']/i)
  return match ? match[1] : html
}

function countQuestionMarkers(text) {
  return text
    .split('\n')
    .filter((line) => /^\s*\d{1,2}[、.．]/.test(line.trim()))
    .length
}

const files = fs
  .readdirSync(pagesDir)
  .filter((file) => /^(marx|history)-\d{4}-\d{2}\.html$/.test(file))
  .sort()

const answerQueueEntries = []

const records = files.map((file) => {
  const html = fs.readFileSync(path.join(pagesDir, file), 'utf8')
  const contentHtml = extractContent(html)
  const title = getFirstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || getFirstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i)
  const text = stripHtml(contentHtml)
  const [, courseKey, year, month] = file.match(/^(marx|history)-(\d{4})-(\d{2})\.html$/)
  const answerLinks = [...contentHtml.matchAll(/href=["']([^"']*\/daan\/[^"']*)["'][^>]*class=["'][^"']*red_btn/gi)]
    .map((match) => match[1])
    .map((href) => (href.startsWith('http') ? href : `https://www.zikaosw.cn${href}`))
  const imageLinks = [...contentHtml.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((match) =>
    match[1].startsWith('http') ? match[1] : `https://www.zikaosw.cn${match[1]}`,
  )
  const sourceId = sourceIds[file]
  const sourceUrl = sourceId ? `https://www.zikaosw.cn/news/${sourceId}.html` : ''
  const textFile = `text/older/${file.replace(/\.html$/, '.txt')}`
  const pageFile = `pages/older/${file}`
  const course = courseMap[courseKey]
  const hasMoreSetLink = /更多本套试题及答案/i.test(contentHtml)

  answerLinks.forEach((answerUrl, index) => {
    const answerId = answerUrl.match(/\/daan\/(\d+)\.html/)?.[1] ?? ''
    answerQueueEntries.push({
      courseId: course.courseId,
      code: course.code,
      legacyCode: course.legacyCode,
      title,
      year: Number(year),
      session: `${Number(month)}月`,
      questionNo: index + 1,
      answerId,
      answerUrl,
      sourceUrl,
      pageFile,
      textFile,
      accessStatus: 'requires-login-and-paid-search-package',
    })
  })

  fs.writeFileSync(
    path.join(rootDir, textFile),
    [
      `# ${title}`,
      '',
      `课程：${course.name}（${course.code}/${course.legacyCode}）`,
      `来源：${sourceUrl}`,
      `本地网页：${pageFile}`,
      `答案入口：${answerLinks.length} 个（站点答案接口提示需登录/开通搜题包，先保留入口，后续登录或改用 PDF/OCR 补答案）`,
      `图片：${imageLinks.length} 张`,
      '',
      '## 正文',
      '',
      text,
      '',
    ].join('\n'),
  )

  return {
    courseId: course.courseId,
    code: course.code,
    legacyCode: course.legacyCode,
    title,
    year: Number(year),
    session: `${Number(month)}月`,
    sourceUrl,
    pageFile,
    textFile,
    visibleQuestionCount: countQuestionMarkers(text),
    coverageStatus: hasMoreSetLink ? 'partial-preview-visible-15-questions' : 'visible-page-content',
    answerLinkCount: answerLinks.length,
    answerLinks,
    imageCount: imageLinks.length,
    answerStatus: answerLinks.length ? 'linked-requires-login-or-paid-access' : 'not-found-in-page',
    sourceType: 'web-page',
  }
})

fs.writeFileSync(
  path.join(indexDir, 'older-web-pages.json'),
  `${JSON.stringify(
    {
      updatedAt,
      note: '2016-2021 公共课旧真题网页快照索引。题目正文已抽成 text/older；答案入口已保留，但自考生网答案接口当前提示需登录/开通搜题包。',
      total: records.length,
      records,
    },
    null,
    2,
  )}\n`,
)

fs.writeFileSync(
  path.join(indexDir, 'zikaosw-answer-queue.json'),
  `${JSON.stringify(
    {
      updatedAt,
      note: '自考生网旧年份预览题答案抓取队列。仅在用户已登录且有对应查看答案权限时使用；未授权时不可进入正式题库。',
      endpoint: 'https://www.zikaosw.cn/daan/get_answer',
      method: 'POST',
      requiredAccess: '登录账号 + 已开通搜题包/AI搜索或等效答案查看权限',
      total: answerQueueEntries.length,
      records: answerQueueEntries,
    },
    null,
    2,
  )}\n`,
)

console.log(`Extracted ${records.length} old paper pages.`)
console.log(`Prepared ${answerQueueEntries.length} answer queue entries.`)
