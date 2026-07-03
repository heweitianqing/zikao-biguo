import type { Course, ImportedBank, Paper, Question } from '../types'

type ParserMeta = {
  courseId: string
  title: string
  year: number
  session: Paper['session']
}

type ParseResult = {
  bank: ImportedBank
  warnings: string[]
}

function normalizeId(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function splitQuestionBlocks(rawText: string) {
  const lines = rawText
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const blocks: string[][] = []
  let current: string[] | null = null

  for (const line of lines) {
    if (/^\d{1,3}[.．、]\s*/.test(line)) {
      if (current?.length) {
        blocks.push(current)
      }
      current = [line]
    } else if (current) {
      current.push(line)
    }
  }

  if (current?.length) {
    blocks.push(current)
  }

  return blocks
}

function cleanQuestionNumber(line: string) {
  return line.replace(/^\d{1,3}[.．、]\s*/, '').trim()
}

function splitGlobalAnswerSection(rawText: string) {
  const lines = rawText.replace(/\r/g, '').split('\n')
  let cursor = 0

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim()
    const looksLikeGlobalHeader =
      /^(?:参考答案及解析|答案及解析|试题答案及解析|参考答案|试题答案|标准答案|答案解析|参考解析)\s*[:：]?/.test(trimmed) ||
      (/^答案\s*[:：]?\s*$/.test(trimmed) && index > lines.length * 0.6)

    if (looksLikeGlobalHeader) {
      return {
        questionText: rawText.slice(0, cursor),
        answerText: rawText.slice(cursor),
      }
    }

    cursor += line.length + 1
  }

  return { questionText: rawText, answerText: '' }
}

function parseNumberedAnswerEntries(answerText: string) {
  const entryMap = new Map<number, string>()
  const normalized = answerText.replace(/\r/g, '')

  for (const match of normalized.matchAll(
    /(?:^|\n)\s*(?:第\s*)?(\d{1,3})\s*(?:[.．、]|题\s*[:：、.]?)\s*([\s\S]*?)(?=\n\s*(?:第\s*)?\d{1,3}\s*(?:[.．、]|题\s*[:：、.]?)\s*|$)/g,
  )) {
    const questionNo = Number(match[1])
    const entry = match[2].trim()
    if (entry) {
      entryMap.set(questionNo, entry)
    }
  }

  return entryMap
}

function parseGlobalAnswerMap(answerText: string) {
  const answerMap = new Map<number, string>()

  for (const match of answerText.matchAll(/(\d{1,3})\s*[-—~至]\s*(\d{1,3})\s*[:：]?\s*([A-H]{2,})/gi)) {
    const start = Number(match[1])
    const end = Number(match[2])
    const letters = match[3].toUpperCase().split('')
    for (let questionNo = start; questionNo <= end; questionNo += 1) {
      const answer = letters[questionNo - start]
      if (answer) {
        answerMap.set(questionNo, answer)
      }
    }
  }

  for (const match of answerText.matchAll(/(?:^|[\s，,；;。])(\d{1,3})\s*[.．、:：]\s*([A-H]{1,6})(?=$|[\s，,；;。])/gi)) {
    answerMap.set(Number(match[1]), match[2].toUpperCase())
  }

  for (const match of answerText.matchAll(/(?:^|[\s，,；;。])(\d{1,3})\s*题\s*[:：]\s*([A-H]{1,6})(?=$|[\s，,；;。])/gi)) {
    answerMap.set(Number(match[1]), match[2].toUpperCase())
  }

  return answerMap
}

function cleanGlobalTextAnswer(entry: string) {
  const explicitAnswer =
    entry.match(/(?:答案|参考答案|【答案】|〖答案〗)\s*[:：]?\s*([\s\S]*?)(?=(?:解析|参考解析|【解析】|〖解析〗)\s*[:：]?|$)/)?.[1] ??
    entry
  return explicitAnswer
    .replace(/(?:解析|参考解析|【解析】|〖解析〗)\s*[:：]?[\s\S]*$/i, '')
    .replace(/^(?:答案|参考答案|要点|参考要点|评分点|评分标准)\s*[:：]?/i, '')
    .replace(/^[A-H]{1,6}\s*[。；;，,、:]?\s*/i, '')
    .trim()
}

function parseGlobalTextAnswerMap(answerText: string) {
  const entries = parseNumberedAnswerEntries(answerText)
  const answerMap = new Map<number, string>()

  entries.forEach((entry, questionNo) => {
    const answer = cleanGlobalTextAnswer(entry)
    if (answer) {
      answerMap.set(questionNo, answer)
    }
  })

  return answerMap
}

function parseGlobalAnalysisMap(answerText: string) {
  const analysisMap = new Map<number, string>()
  const entries = parseNumberedAnswerEntries(answerText)

  entries.forEach((entry, questionNo) => {
    const analysis =
      entry.match(/(?:解析|参考解析|【解析】|〖解析〗)\s*[:：]?\s*([\s\S]*)/)?.[1]?.trim() ??
      entry.match(/[A-H]{1,6}\s*[。；;，,]\s*([\s\S]{12,})/)?.[1]?.trim() ??
      ''

    if (analysis) {
      analysisMap.set(questionNo, analysis)
    }
  })

  return analysisMap
}

function getQuestionNumber(line: string, fallback: number) {
  return Number(line.match(/^(\d{1,3})[.．、]/)?.[1] ?? fallback)
}

function getOptionMarkers(text: string) {
  return Array.from(text.matchAll(/(^|[\n\s])([A-H])[\s.．、:：]/g)).map((match) => ({
    index: match.index + match[1].length,
    markerLength: match[0].length - match[1].length,
  }))
}

function getFirstOptionIndex(text: string) {
  return getOptionMarkers(text)[0]?.index ?? -1
}

function getAnswerOrAnalysisIndex(text: string) {
  const answerIndex = text.search(/(?:^|\n|\s)(?:答案|参考答案|【答案】|〖答案〗)\s*[:：]?/)
  const analysisIndex = text.search(/(?:^|\n|\s)(?:解析|参考解析|【解析】|〖解析〗)\s*[:：]?/)
  const indexes = [answerIndex, analysisIndex].filter((index) => index >= 0)
  return indexes.length ? Math.min(...indexes) : text.length
}

function extractSection(text: string, labels: string[], stopLabels: string[]) {
  const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const stopPattern = stopLabels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const match = text.match(new RegExp(`(?:${labelPattern})\\s*[:：]?\\s*([\\s\\S]*?)(?=\\n\\s*(?:${stopPattern})\\s*[:：]?|$)`, 'i'))
  return match?.[1]?.trim() ?? ''
}

function parseOptions(text: string) {
  const markers = getOptionMarkers(text)
  const cutAt = getAnswerOrAnalysisIndex(text)
  const options = markers.map((marker, index) => {
    const nextMarker = markers[index + 1]
    const end = Math.min(nextMarker?.index ?? cutAt, cutAt)
    return text
      .slice(marker.index + marker.markerLength, end)
      .replace(/\s+/g, ' ')
      .trim()
  })

  return options.filter(Boolean)
}

function extractStem(text: string, hasOptions: boolean) {
  const withoutNumber = text.replace(/^\d{1,3}[.．、]\s*/, '').trim()
  const optionIndex = hasOptions ? getFirstOptionIndex(withoutNumber) : -1
  const answerIndex = withoutNumber.search(/\n\s*(?:答案|参考答案|【答案】|〖答案〗)\s*[:：]?/)
  const analysisIndex = withoutNumber.search(/\n\s*(?:解析|参考解析|【解析】|〖解析〗)\s*[:：]?/)
  const cutPoints = [optionIndex, answerIndex, analysisIndex].filter((index) => index >= 0)
  const cutAt = cutPoints.length ? Math.min(...cutPoints) : withoutNumber.length
  return withoutNumber.slice(0, cutAt).replace(/\s+/g, ' ').trim()
}

function splitTextAnswer(answerRaw: string) {
  return answerRaw
    .split(/\n|；|;|(?=\d+[.．、])/)
    .map((item) => item.replace(/^[-•\d.．、\s]+/, '').trim())
    .filter(Boolean)
}

function inferType(stem: string, answerLetters: string[], hasOptions: boolean): Question['type'] {
  if (hasOptions) {
    return answerLetters.length > 1 ? 'multiple' : 'single'
  }
  if (/论述|分析|结合|怎样认识|如何理解|为什么说|谈谈/.test(stem) && !/^简述/.test(stem)) {
    return 'essay'
  }
  return 'short'
}

function inferChapter(course: Course, stem: string) {
  const normalized = stem.replace(/\s/g, '')
  const scored = course.outline.map((chapter) => {
    const titleHits = chapter.title
      .split(/[：、，,]/)
      .filter((part) => part.length >= 2 && normalized.includes(part.replace(/\s/g, ''))).length
    const focusHits = chapter.focus.filter((focus) => normalized.includes(focus.replace(/\s/g, ''))).length
    return { chapterId: chapter.id, score: titleHits * 2 + focusHits }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored[0]?.score ? scored[0].chapterId : course.outline[0]?.id
}

function pointsFor(type: Question['type']) {
  if (type === 'single') return 2
  if (type === 'multiple') return 4
  if (type === 'short') return 8
  return 14
}

function difficultyFor(type: Question['type']): Question['difficulty'] {
  if (type === 'essay') return '较难'
  if (type === 'short') return '较易'
  return '易'
}

export function parsePastedPaperText(rawText: string, course: Course, meta: ParserMeta): ParseResult {
  const warnings: string[] = []
  const globalSections = splitGlobalAnswerSection(rawText)
  const globalAnswerMap = parseGlobalAnswerMap(globalSections.answerText)
  const globalTextAnswerMap = parseGlobalTextAnswerMap(globalSections.answerText)
  const globalAnalysisMap = parseGlobalAnalysisMap(globalSections.answerText)
  const blocks = splitQuestionBlocks(globalSections.questionText)
  const paperSlug = normalizeId(`${meta.courseId}-${meta.year}-${meta.session}-${meta.title}`) || `paper-${Date.now()}`
  const paperId = `import-${paperSlug}`

  const questions: Question[] = blocks.flatMap((block, index) => {
    const fullText = block.join('\n')
    const questionNo = getQuestionNumber(block[0] ?? '', index + 1)
    const firstLine = cleanQuestionNumber(block[0] ?? '')
    if (!firstLine) {
      return []
    }

    const options = parseOptions(fullText)
    const answerRaw = extractSection(fullText, ['答案', '参考答案', '【答案】', '〖答案〗'], [
      '解析',
      '参考解析',
      '【解析】',
      '〖解析〗',
      '评分点',
      '评分标准',
      '要点',
    ]) || (options.length ? globalAnswerMap.get(questionNo) : globalTextAnswerMap.get(questionNo)) || ''
    const analysis =
      extractSection(fullText, ['解析', '参考解析', '【解析】', '〖解析〗'], ['评分点', '评分标准', '要点']) ||
      globalAnalysisMap.get(questionNo) ||
      '本题来自粘贴导入，暂未提供解析。建议补充教材页码、考点和易错点。'
    const answerLetters = options.length ? Array.from(new Set(answerRaw.toUpperCase().match(/[A-H]/g) ?? [])) : []
    const stem = extractStem(fullText, options.length > 0)
    const type = inferType(stem, answerLetters, options.length > 0)
    const answer = options.length ? answerLetters : splitTextAnswer(answerRaw)

    if (!stem) {
      warnings.push(`第 ${index + 1} 段没有识别到题干，已跳过。`)
      return []
    }

    if (!answer.length) {
      warnings.push(`第 ${index + 1} 题没有识别到答案，已用“待补充答案”占位。`)
    }

    return [
      {
        id: `${paperId}-q${String(index + 1).padStart(3, '0')}`,
        courseId: meta.courseId,
        paperId,
        type,
        chapterId: inferChapter(course, stem) ?? course.outline[0]?.id ?? '',
        stem,
        options: options.length ? options : undefined,
        answer: answer.length ? answer : ['待补充答案'],
        analysis,
        points: pointsFor(type),
        difficulty: difficultyFor(type),
        sourceKind: 'imported',
        tags: ['粘贴导入', meta.session, String(meta.year)],
        rubric: type === 'short' || type === 'essay' ? splitTextAnswer(answerRaw).slice(0, 6) : undefined,
      } satisfies Question,
    ]
  })

  const paper: Paper = {
    id: paperId,
    courseId: meta.courseId,
    title: meta.title.trim() || `${course.code} ${meta.year} 年${meta.session}导入卷`,
    year: meta.year,
    session: meta.session,
    sourceKind: 'imported',
    status: 'ready',
    description: '由资源页粘贴文本自动整理生成，可继续补充解析和评分点。',
    minutes: course.examMinutes,
    totalScore: questions.reduce((sum, question) => sum + question.points, 0),
    questionIds: questions.map((question) => question.id),
  }

  if (!questions.length) {
    warnings.push('没有识别到题目。请确认每题以“1.”、“2.”这样的题号开头。')
  }

  return {
    bank: {
      papers: questions.length ? [paper] : [],
      questions,
    },
    warnings,
  }
}
