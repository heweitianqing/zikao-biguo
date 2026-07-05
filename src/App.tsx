import {
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ClipboardCheck,
  Copy,
  Download,
  ExternalLink,
  FileQuestion,
  Gauge,
  History,
  Import,
  KeyRound,
  LibraryBig,
  ListFilter,
  MapPinned,
  PlayCircle,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Target,
  Trophy,
  Upload,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import './App.css'
import { courses, importTemplate, papers as seedPapers, pastPaperSources, questions as seedQuestions, sourceGapRecords } from './data/questionBank'
import type { AnswerRecord, AppState, Course, ImportedBank, Paper, PaperAttempt, Question, QuestionType } from './types'
import { parsePastedPaperText } from './utils/paperParser'
import {
  calculatePaperScore,
  getQuestionScore,
  getQuestionStatus,
  questionLabel,
  scoreObjective,
  scoreTextAnswer,
  sourceLabel,
} from './utils/scoring'
import { clearAllStorage, loadImports, loadState, saveImports, saveState } from './utils/storage'

const defaultState: AppState = {
  selectedCourseId: 'marx',
  selectedPaperId: 'marx-outline-sample',
  selectedQuestionIndex: 0,
  view: 'practice',
  attempts: {},
  deepseekApiKey: '',
}

type AiReview = {
  questionId: string
  content: string
  loading: boolean
}

type MistakeReviewItem = {
  question: Question
  record: AnswerRecord
  paper: Paper | undefined
  course: Course
  chapterTitle: string
  earned: number
}

type CourseProgressSummary = {
  readyPapers: number
  pendingPapers: number
  submittedPapers: number
  inProgressPapers: number
  checkedQuestions: number
  totalQuestions: number
  wrongQuestions: number
  lastScore?: {
    paperTitle: string
    score: number
    totalScore: number
    pass: boolean
  }
}

type CourseStudyTask = {
  id: string
  kind: 'continue' | 'review' | 'start' | 'import' | 'complete'
  title: string
  detail: string
  actionLabel: string
  paper?: Paper
}

type ChapterStudyRow = {
  id: string
  title: string
  focus: string[]
  mustKnow: string[]
  questionPatterns: string[]
  studySteps: string[]
  questions: Question[]
  checkedQuestions: number
  wrongQuestions: number
  objectiveQuestions: number
  textQuestions: number
  readyPapers: number
  pendingPapers: number
}

function createAttempt(paper: Paper) {
  return {
    paperId: paper.id,
    currentIndex: 0,
    answers: {},
    startedAt: new Date().toISOString(),
  }
}

function getOptionLetter(index: number) {
  return String.fromCharCode(65 + index)
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function getPastPaperSearchQuery(course: Course) {
  const codes = [course.code, ...(course.legacyCodes ?? [])].join(' ')
  return `${codes} ${course.name} 自考历年真题 答案 PDF`
}

function getSearchUrl(query: string) {
  return `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`
}

function getPaperSlotKey(paper: Pick<Paper, 'courseId' | 'year' | 'session'>) {
  return `${paper.courseId}-${paper.year}-${paper.session}`
}

function filterCoveredIndexPapers(papers: Paper[]) {
  const coveredSlots = new Set(
    papers
      .filter((paper) => paper.sourceKind === 'imported' && paper.status === 'ready')
      .map((paper) => getPaperSlotKey(paper)),
  )

  return papers.filter((paper) => !(paper.status === 'needs-import' && coveredSlots.has(getPaperSlotKey(paper))))
}

function getLatestCheckedAnswer(questionId: string, attempts: Record<string, PaperAttempt>) {
  return Object.values(attempts)
    .map((attempt) => ({ attempt, record: attempt.answers[questionId] }))
    .filter((item): item is { attempt: PaperAttempt; record: AnswerRecord } => Boolean(item.record?.checked))
    .sort((a, b) => b.record.updatedAt.localeCompare(a.record.updatedAt))[0]
}

function getPaperTimelineStatus(paper: Paper, questions: Question[], attempt: PaperAttempt | undefined, passScore: number) {
  if (paper.status !== 'ready') {
    return {
      tone: 'pending',
      label: '待导入',
      detail: '点开预填制卷',
    }
  }

  const answers = attempt?.answers ?? {}
  const answeredCount = questions.filter((question) => {
    const record = answers[question.id]
    return Boolean(record?.answer.length || record?.textAnswer.trim())
  }).length
  const checkedCount = questions.filter((question) => answers[question.id]?.checked).length

  if (attempt?.submittedAt) {
    const earnedScore = questions.reduce((sum, question) => sum + getQuestionScore(question, answers[question.id]), 0)
    const possibleScore = questions.reduce((sum, question) => sum + question.points, 0)
    const scaledScore = possibleScore ? Math.round((earnedScore / possibleScore) * paper.totalScore) : 0
    const wrongCount = questions.filter((question) => getQuestionScore(question, answers[question.id]) < question.points).length
    return {
      tone: scaledScore >= passScore ? 'done' : 'review',
      label: `上次 ${scaledScore}/${paper.totalScore}`,
      detail: wrongCount ? `${wrongCount} 题待复盘` : '已达通过线',
    }
  }

  if (answeredCount || checkedCount) {
    return {
      tone: 'progress',
      label: `已答 ${answeredCount}/${questions.length}`,
      detail: checkedCount ? `${checkedCount} 题已判` : '还未交卷',
    }
  }

  return {
    tone: 'ready',
    label: `${paper.questionIds.length} 题可刷`,
    detail: '尚未开始',
  }
}

function getCourseProgressSummary(
  papers: Paper[],
  questionById: Map<string, Question>,
  attempts: Record<string, PaperAttempt>,
  passScore: number,
): CourseProgressSummary {
  const readyPapers = papers.filter((paper) => paper.status === 'ready')
  const submittedAttempts = readyPapers
    .map((paper) => ({ paper, attempt: attempts[paper.id] }))
    .filter((item): item is { paper: Paper; attempt: PaperAttempt } => Boolean(item.attempt?.submittedAt))
    .sort((a, b) => (b.attempt.submittedAt ?? '').localeCompare(a.attempt.submittedAt ?? ''))

  const checkedQuestionIds = new Set<string>()
  const wrongQuestionIds = new Set<string>()

  readyPapers.forEach((paper) => {
    const attempt = attempts[paper.id]
    if (!attempt) return

    paper.questionIds.forEach((id) => {
      const question = questionById.get(id)
      const record = attempt.answers[id]
      if (!question || !record?.checked) return
      checkedQuestionIds.add(id)
      if (getQuestionScore(question, record) < question.points) {
        wrongQuestionIds.add(id)
      }
    })
  })

  const lastSubmitted = submittedAttempts[0]
  const lastQuestions = lastSubmitted?.paper.questionIds
    .map((id) => questionById.get(id))
    .filter((question): question is Question => Boolean(question))
  const lastPossibleScore = lastQuestions?.reduce((sum, question) => sum + question.points, 0) ?? 0
  const lastEarnedScore =
    lastQuestions?.reduce((sum, question) => sum + getQuestionScore(question, lastSubmitted?.attempt.answers[question.id]), 0) ?? 0
  const lastScaledScore =
    lastSubmitted && lastPossibleScore ? Math.round((lastEarnedScore / lastPossibleScore) * lastSubmitted.paper.totalScore) : undefined

  return {
    readyPapers: readyPapers.length,
    pendingPapers: papers.filter((paper) => paper.status !== 'ready').length,
    submittedPapers: submittedAttempts.length,
    inProgressPapers: readyPapers.filter((paper) => {
      const attempt = attempts[paper.id]
      return Boolean(attempt && !attempt.submittedAt && Object.keys(attempt.answers).length)
    }).length,
    checkedQuestions: checkedQuestionIds.size,
    totalQuestions: readyPapers.reduce((sum, paper) => sum + paper.questionIds.length, 0),
    wrongQuestions: wrongQuestionIds.size,
    lastScore:
      lastSubmitted && lastScaledScore !== undefined
        ? {
            paperTitle: lastSubmitted.paper.title,
            score: lastScaledScore,
            totalScore: lastSubmitted.paper.totalScore,
            pass: lastScaledScore >= passScore,
          }
      : undefined,
  }
}

function getCourseStudyTasks(
  papers: Paper[],
  questionById: Map<string, Question>,
  attempts: Record<string, PaperAttempt>,
  mistakeCount: number,
): CourseStudyTask[] {
  const readyPapers = papers.filter((paper) => paper.status === 'ready')
  const pendingPapers = papers
    .filter((paper) => paper.status !== 'ready')
    .slice()
    .sort((a, b) => b.year - a.year || a.title.localeCompare(b.title))

  const inProgressPapers = readyPapers
    .map((paper) => {
      const attempt = attempts[paper.id]
      if (!attempt || attempt.submittedAt || !Object.keys(attempt.answers).length) {
        return undefined
      }

      const questions = paper.questionIds.map((id) => questionById.get(id)).filter((question): question is Question => Boolean(question))
      const answeredCount = questions.filter((question) => {
        const record = attempt.answers[question.id]
        return Boolean(record?.answer.length || record?.textAnswer.trim())
      }).length
      const checkedCount = questions.filter((question) => attempt.answers[question.id]?.checked).length
      const lastUpdated = Object.values(attempt.answers)
        .map((record) => record.updatedAt)
        .sort()
        .at(-1)

      return {
        paper,
        total: questions.length,
        answeredCount,
        checkedCount,
        lastUpdated: lastUpdated ?? attempt.startedAt,
      }
    })
    .filter((item): item is { paper: Paper; total: number; answeredCount: number; checkedCount: number; lastUpdated: string } =>
      Boolean(item),
    )
    .sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated))

  const unstartedPaper = readyPapers.find((paper) => {
    const attempt = attempts[paper.id]
    return !attempt || (!attempt.submittedAt && !Object.keys(attempt.answers).length)
  })

  const tasks: CourseStudyTask[] = []
  const activePaper = inProgressPapers[0]
  if (activePaper) {
    tasks.push({
      id: `continue-${activePaper.paper.id}`,
      kind: 'continue',
      title: `继续 ${activePaper.paper.title}`,
      detail: `已答 ${activePaper.answeredCount}/${activePaper.total}，已判 ${activePaper.checkedCount}/${activePaper.total}`,
      actionLabel: '继续刷',
      paper: activePaper.paper,
    })
  }

  if (mistakeCount) {
    tasks.push({
      id: 'review-mistakes',
      kind: 'review',
      title: `复盘 ${mistakeCount} 道错题`,
      detail: '先把最近失分题清掉，再开新卷更稳。',
      actionLabel: '打开错题',
    })
  }

  if (unstartedPaper) {
    tasks.push({
      id: `start-${unstartedPaper.id}`,
      kind: 'start',
      title: `开刷 ${unstartedPaper.title}`,
      detail: `${unstartedPaper.questionIds.length} 题 · ${unstartedPaper.minutes} 分钟 · ${sourceLabel(unstartedPaper.sourceKind)}`,
      actionLabel: '开始',
      paper: unstartedPaper,
    })
  }

  const nextPendingPaper = pendingPapers[0]
  if (nextPendingPaper) {
    tasks.push({
      id: `import-${nextPendingPaper.id}`,
      kind: 'import',
      title: `补齐 ${nextPendingPaper.title}`,
      detail: '点开后会进入资源页并预填制卷信息。',
      actionLabel: '预填制卷',
      paper: nextPendingPaper,
    })
  }

  if (!tasks.length) {
    tasks.push({
      id: 'complete',
      kind: 'complete',
      title: '本课暂时收干净了',
      detail: '可以重刷已完成卷，或去资源页继续补历年真题。',
      actionLabel: '查看真题',
    })
  }

  return tasks.slice(0, 4)
}

function getChapterStudyRows(
  course: Course,
  questions: Question[],
  papers: Paper[],
  attempts: Record<string, PaperAttempt>,
): ChapterStudyRow[] {
  return course.outline.map((chapter) => {
    const scopedQuestions = questions.filter((question) => question.courseId === course.id && question.chapterId === chapter.id)
    const questionIds = new Set(scopedQuestions.map((question) => question.id))
    const checkedQuestions = scopedQuestions.filter((question) => getLatestCheckedAnswer(question.id, attempts)).length
    const wrongQuestions = scopedQuestions.filter((question) => {
      const latest = getLatestCheckedAnswer(question.id, attempts)
      return latest ? getQuestionScore(question, latest.record) < question.points : false
    }).length
    const readyPapers = papers.filter((paper) => paper.status === 'ready' && paper.questionIds.some((id) => questionIds.has(id))).length
    const pendingPapers = papers.filter((paper) => paper.status === 'needs-import' && paper.courseId === course.id).length

    return {
      id: chapter.id,
      title: chapter.title,
      focus: chapter.focus,
      mustKnow: chapter.mustKnow ?? [],
      questionPatterns: chapter.questionPatterns ?? [],
      studySteps: chapter.studySteps ?? [],
      questions: scopedQuestions,
      checkedQuestions,
      wrongQuestions,
      objectiveQuestions: scopedQuestions.filter((question) => question.type === 'single' || question.type === 'multiple').length,
      textQuestions: scopedQuestions.filter((question) => question.type === 'short' || question.type === 'essay').length,
      readyPapers,
      pendingPapers,
    }
  })
}

function App() {
  const [state, setState] = useState<AppState>(() => loadState(defaultState))
  const [imports, setImports] = useState<ImportedBank>(() => loadImports())
  const [generatedBank, setGeneratedBank] = useState<ImportedBank>({ papers: [], questions: [] })
  const [reviewPaper, setReviewPaper] = useState<Paper | null>(null)
  const [aiReview, setAiReview] = useState<AiReview | null>(null)
  const [notice, setNotice] = useState('已按上海电机学院 2025 计划初始化题库。')

  useEffect(() => {
    let cancelled = false

    import('./data/generatedPastPapers')
      .then(({ generatedPastPapers, generatedPastQuestions }) => {
        if (cancelled) return

        setGeneratedBank({ papers: generatedPastPapers, questions: generatedPastQuestions })
        setNotice(`已加载 ${generatedPastPapers.length} 套内置真题扩展包，可继续刷历年题。`)
      })
      .catch(() => {
        if (cancelled) return

        setNotice('真题扩展包加载失败，当前只显示基础题库和本地导入题。')
      })

    return () => {
      cancelled = true
    }
  }, [])

  const basePapers = useMemo(() => [...seedPapers, ...generatedBank.papers, ...imports.papers], [generatedBank.papers, imports.papers])
  const allPapers = useMemo(() => (reviewPaper ? [...basePapers, reviewPaper] : basePapers), [basePapers, reviewPaper])
  const visiblePapers = useMemo(() => filterCoveredIndexPapers(basePapers), [basePapers])
  const allQuestions = useMemo(
    () => [...seedQuestions, ...generatedBank.questions, ...imports.questions],
    [generatedBank.questions, imports.questions],
  )
  const questionById = useMemo(() => new Map(allQuestions.map((question) => [question.id, question])), [allQuestions])
  const paperById = useMemo(() => new Map(allPapers.map((paper) => [paper.id, paper])), [allPapers])
  const courseById = useMemo(() => new Map(courses.map((course) => [course.id, course])), [])

  const selectedCourse = courses.find((course) => course.id === state.selectedCourseId) ?? courses[0]
  const coursePapers = visiblePapers
    .filter((paper) => paper.courseId === selectedCourse.id)
    .sort((a, b) => b.year - a.year || a.title.localeCompare(b.title))
  const courseProgress = getCourseProgressSummary(coursePapers, questionById, state.attempts, selectedCourse.passScore)
  const selectedPaper =
    (reviewPaper?.id === state.selectedPaperId ? reviewPaper : undefined) ??
    visiblePapers.find((paper) => paper.id === state.selectedPaperId && paper.courseId === selectedCourse.id) ??
    coursePapers[0] ??
    visiblePapers[0] ??
    basePapers[0]
  const paperQuestions = selectedPaper.questionIds
    .map((id) => questionById.get(id))
    .filter((question): question is Question => Boolean(question))
  const currentQuestion = paperQuestions[state.selectedQuestionIndex] ?? paperQuestions[0]
  const currentAttempt = state.attempts[selectedPaper.id] ?? createAttempt(selectedPaper)
  const currentRecord = currentQuestion ? currentAttempt.answers[currentQuestion.id] : undefined
  const answeredCount = selectedPaper.questionIds.filter((id) => currentAttempt.answers[id]?.checked).length
  const score = calculatePaperScore(selectedPaper, paperQuestions, currentAttempt.answers)
  const progress = paperQuestions.length ? Math.round((answeredCount / paperQuestions.length) * 100) : 0
  const mistakeItems = allQuestions
    .map((question) => {
      const latest = getLatestCheckedAnswer(question.id, state.attempts)
      if (!latest) return undefined

      const { attempt, record } = latest

      const earned = getQuestionScore(question, record)
      if (earned >= question.points) return undefined

      const course = courseById.get(question.courseId)
      if (!course) return undefined

      const chapterTitle = course.outline.find((chapter) => chapter.id === question.chapterId)?.title ?? '未归类章节'

      return {
        question,
        record,
        paper: paperById.get(attempt?.paperId ?? question.paperId) ?? paperById.get(question.paperId),
        course,
        chapterTitle,
        earned,
      }
    })
    .filter((item): item is MistakeReviewItem => Boolean(item))
    .sort((a, b) => b.record.updatedAt.localeCompare(a.record.updatedAt))
  const selectedCourseMistakes = mistakeItems.filter((item) => item.course.id === selectedCourse.id)
  const courseStudyTasks = getCourseStudyTasks(coursePapers, questionById, state.attempts, selectedCourseMistakes.length)
  const chapterStudyRows = getChapterStudyRows(selectedCourse, allQuestions, coursePapers, state.attempts)

  useEffect(() => {
    saveState(state)
  }, [state])

  function patchState(patch: Partial<AppState>) {
    setState((current) => ({ ...current, ...patch }))
  }

  function ensureAttempt(paper: Paper) {
    setState((current) => {
      if (current.attempts[paper.id]) {
        return current
      }
      return {
        ...current,
        attempts: {
          ...current.attempts,
          [paper.id]: createAttempt(paper),
        },
      }
    })
  }

  function selectCourse(courseId: string) {
    const firstPaper = visiblePapers.find((paper) => paper.courseId === courseId)
    patchState({
      selectedCourseId: courseId,
      selectedPaperId: firstPaper?.id ?? state.selectedPaperId,
      selectedQuestionIndex: 0,
      view: 'practice',
    })
  }

  function selectPaper(paper: Paper) {
    patchState({
      selectedCourseId: paper.courseId,
      selectedPaperId: paper.id,
      selectedQuestionIndex: 0,
      view: paper.status === 'ready' ? 'practice' : 'resources',
    })
    if (paper.status === 'ready') {
      ensureAttempt(paper)
    } else {
      setNotice(`${paper.title} 还没有导入题目，已切到资源页并预填制卷信息。`)
    }
  }

  function answerChoice(question: Question, choice: string) {
    setState((current) => {
      const attempt = current.attempts[selectedPaper.id] ?? createAttempt(selectedPaper)
      const existing = attempt.answers[question.id]
      const isMultiple = question.type === 'multiple'
      const nextAnswer = isMultiple
        ? existing?.answer.includes(choice)
          ? existing.answer.filter((item) => item !== choice)
          : [...(existing?.answer ?? []), choice]
        : [choice]
      const earned = scoreObjective(question, nextAnswer)
      const nextRecord: AnswerRecord = {
        questionId: question.id,
        answer: nextAnswer,
        textAnswer: existing?.textAnswer ?? '',
        checked: true,
        earned,
        updatedAt: new Date().toISOString(),
      }
      return {
        ...current,
        attempts: {
          ...current.attempts,
          [selectedPaper.id]: {
            ...attempt,
            answers: {
              ...attempt.answers,
              [question.id]: nextRecord,
            },
          },
        },
      }
    })
  }

  function answerText(question: Question, textAnswer: string) {
    setState((current) => {
      const attempt = current.attempts[selectedPaper.id] ?? createAttempt(selectedPaper)
      const existing = attempt.answers[question.id]
      const nextRecord: AnswerRecord = {
        questionId: question.id,
        answer: existing?.answer ?? [],
        textAnswer,
        checked: false,
        earned: 0,
        updatedAt: new Date().toISOString(),
      }
      return {
        ...current,
        attempts: {
          ...current.attempts,
          [selectedPaper.id]: {
            ...attempt,
            answers: {
              ...attempt.answers,
              [question.id]: nextRecord,
            },
          },
        },
      }
    })
  }

  function checkQuestion(question: Question) {
    setState((current) => {
      const attempt = current.attempts[selectedPaper.id] ?? createAttempt(selectedPaper)
      const existing = attempt.answers[question.id] ?? {
        questionId: question.id,
        answer: [],
        textAnswer: '',
        checked: false,
        earned: 0,
        updatedAt: new Date().toISOString(),
      }
      const earned =
        question.type === 'single' || question.type === 'multiple'
          ? scoreObjective(question, existing.answer)
          : scoreTextAnswer(question, existing.textAnswer)
      return {
        ...current,
        attempts: {
          ...current.attempts,
          [selectedPaper.id]: {
            ...attempt,
            answers: {
              ...attempt.answers,
              [question.id]: {
                ...existing,
                checked: true,
                earned,
                updatedAt: new Date().toISOString(),
              },
            },
          },
        },
      }
    })
  }

  function submitPaper() {
    if (!paperQuestions.length) {
      setNotice('这套卷还没有题目，先导入真题。')
      return
    }

    let finalScore = 0
    const now = new Date().toISOString()
    const nextAnswers = paperQuestions.reduce<Record<string, AnswerRecord>>((answers, question) => {
      const existing = currentAttempt.answers[question.id] ?? {
        questionId: question.id,
        answer: [],
        textAnswer: '',
        checked: false,
        earned: 0,
        updatedAt: now,
      }
      const earned =
        question.type === 'single' || question.type === 'multiple'
          ? scoreObjective(question, existing.answer)
          : scoreTextAnswer(question, existing.textAnswer)
      finalScore += earned
      return {
        ...answers,
        [question.id]: {
          ...existing,
          checked: true,
          earned,
          updatedAt: now,
        },
      }
    }, {})

    const possibleScore = paperQuestions.reduce((sum, question) => sum + question.points, 0)
    const scaledScore = possibleScore ? Math.round((finalScore / possibleScore) * selectedPaper.totalScore) : finalScore

    setState((current) => ({
      ...current,
      view: 'report',
      attempts: {
        ...current.attempts,
        [selectedPaper.id]: {
          ...(current.attempts[selectedPaper.id] ?? createAttempt(selectedPaper)),
          answers: nextAnswers,
          submittedAt: now,
        },
      },
    }))
    setNotice(`已交卷：卷面 ${finalScore}/${possibleScore}，折算 ${scaledScore}/${selectedPaper.totalScore}。`)
  }

  async function reviewWithAi(question: Question) {
    const record = currentAttempt.answers[question.id]
    if (!record?.textAnswer.trim()) {
      setNotice('先写一版答案，再点 AI 评价。')
      return
    }

    if (!state.deepseekApiKey.trim()) {
      const rubric = question.rubric?.join('、') || question.answer.join('、')
      setAiReview({
        questionId: question.id,
        loading: false,
        content: `本地评价：这题应覆盖 ${rubric}。当前按关键词估分 ${scoreTextAnswer(
          question,
          record.textAnswer,
        )}/${question.points}。配置 DeepSeek API Key 后可获得更细的逐点反馈。`,
      })
      return
    }

    setAiReview({ questionId: question.id, loading: true, content: '正在请求 DeepSeek 评价...' })
    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.deepseekApiKey.trim()}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content:
                '你是上海自考阅卷助教。按自考简答/论述题标准，给出分数、命中要点、漏点和下一轮背诵建议。不要编造官方答案。',
            },
            {
              role: 'user',
              content: `题目：${question.stem}\n满分：${question.points}\n参考要点：${question.answer.join(
                '；',
              )}\n评分点：${question.rubric?.join('；') ?? '无'}\n我的答案：${record.textAnswer}`,
            },
          ],
          temperature: 0.2,
        }),
      })
      if (!response.ok) {
        throw new Error(`DeepSeek 返回 ${response.status}`)
      }
      const data = (await response.json()) as { choices?: { message?: { content?: string } }[] }
      setAiReview({
        questionId: question.id,
        loading: false,
        content: data.choices?.[0]?.message?.content ?? '没有拿到评价内容，请稍后重试。',
      })
    } catch (error) {
      setAiReview({
        questionId: question.id,
        loading: false,
        content: `AI 评价失败：${error instanceof Error ? error.message : '未知错误'}。可以先使用本地估分。`,
      })
    }
  }

  function goQuestion(offset: number) {
    const nextIndex = Math.min(Math.max(state.selectedQuestionIndex + offset, 0), Math.max(paperQuestions.length - 1, 0))
    patchState({ selectedQuestionIndex: nextIndex })
  }

  function resetPaper(paper: Paper) {
    setState((current) => {
      const nextAttempts = { ...current.attempts }
      delete nextAttempts[paper.id]
      return {
        ...current,
        attempts: nextAttempts,
        selectedQuestionIndex: 0,
      }
    })
    setNotice(`${paper.title} 的答题记录已清空。`)
  }

  function startMistakeReview(items: MistakeReviewItem[]) {
    const questionIds = Array.from(new Set(items.map((item) => item.question.id)))
    if (!questionIds.length) {
      setNotice('当前筛选下没有可重刷的错题。')
      return
    }

    const reviewCourses = Array.from(new Set(items.map((item) => item.course.id)))
    const primaryCourse = courseById.get(reviewCourses[0]) ?? selectedCourse
    const totalPoints = items.reduce((sum, item) => sum + item.question.points, 0)
    const nextReviewPaper: Paper = {
      id: 'mistake-review',
      courseId: primaryCourse.id,
      title: reviewCourses.length === 1 ? `${primaryCourse.shortName} 错题重刷卷` : '跨科错题重刷卷',
      year: new Date().getFullYear(),
      session: '专项',
      sourceKind: 'mock',
      status: 'ready',
      description: `按当前错题筛选生成，共 ${questionIds.length} 题 / 原始 ${totalPoints} 分，判题后会用最新结果更新错题本。`,
      minutes: Math.min(150, Math.max(20, Math.ceil(questionIds.length * 3))),
      totalScore: 100,
      questionIds,
    }

    setReviewPaper(nextReviewPaper)
    setState((current) => {
      const nextAttempts = { ...current.attempts }
      delete nextAttempts[nextReviewPaper.id]
      return {
        ...current,
        selectedCourseId: nextReviewPaper.courseId,
        selectedPaperId: nextReviewPaper.id,
        selectedQuestionIndex: 0,
        view: 'practice',
        attempts: {
          ...nextAttempts,
          [nextReviewPaper.id]: createAttempt(nextReviewPaper),
        },
      }
    })
    setNotice(`已生成 ${questionIds.length} 题错题重刷卷，答对后会从错题本移出。`)
  }

  function startChapterPractice(row: ChapterStudyRow) {
    const questionIds = row.questions.map((question) => question.id)
    if (!questionIds.length) {
      setNotice(`${row.title} 还没有题目覆盖，先补真题或刷整卷。`)
      patchState({ view: 'papers' })
      return
    }

    const totalPoints = row.questions.reduce((sum, question) => sum + question.points, 0)
    const nextReviewPaper: Paper = {
      id: `chapter-${selectedCourse.id}-${row.id}`,
      courseId: selectedCourse.id,
      title: `${selectedCourse.shortName} · ${row.title}专项`,
      year: new Date().getFullYear(),
      session: '专项',
      sourceKind: 'mock',
      status: 'ready',
      description: `按大纲章节生成，共 ${questionIds.length} 题 / 原始 ${totalPoints} 分。`,
      minutes: Math.min(selectedCourse.examMinutes, Math.max(20, Math.ceil(questionIds.length * 4))),
      totalScore: 100,
      questionIds,
    }

    setReviewPaper(nextReviewPaper)
    setState((current) => {
      const nextAttempts = { ...current.attempts }
      delete nextAttempts[nextReviewPaper.id]
      return {
        ...current,
        selectedCourseId: nextReviewPaper.courseId,
        selectedPaperId: nextReviewPaper.id,
        selectedQuestionIndex: 0,
        view: 'practice',
        attempts: {
          ...nextAttempts,
          [nextReviewPaper.id]: createAttempt(nextReviewPaper),
        },
      }
    })
    setNotice(`已生成 ${row.title} 专项卷。`)
  }

  function importBank(bank: ImportedBank, messagePrefix = '已导入') {
    if (!Array.isArray(bank.papers) || !Array.isArray(bank.questions)) {
      throw new Error('导入包必须包含 papers 和 questions 数组。')
    }
    if (!bank.papers.length || !bank.questions.length) {
      throw new Error('导入包里没有可用试卷或题目。')
    }

    const mergedPapers = [
      ...imports.papers.filter((paper) => !bank.papers.some((incoming) => incoming.id === paper.id)),
      ...bank.papers,
    ]
    const mergedQuestions = [
      ...imports.questions.filter((question) => !bank.questions.some((incoming) => incoming.id === question.id)),
      ...bank.questions,
    ]
    const firstPaper = bank.papers[0]
    setImports({ papers: mergedPapers, questions: mergedQuestions })
    saveImports(mergedPapers, mergedQuestions)
    setState((current) => ({
      ...current,
      selectedCourseId: firstPaper.courseId,
      selectedPaperId: firstPaper.id,
      selectedQuestionIndex: 0,
      view: 'practice',
      attempts: {
        ...current.attempts,
        [firstPaper.id]: current.attempts[firstPaper.id] ?? createAttempt(firstPaper),
      },
    }))
    setNotice(`${messagePrefix} ${bank.papers.length} 套试卷、${bank.questions.length} 道题，已切到新试卷。`)
  }

  function deleteImportedPaper(paperId: string) {
    const paper = imports.papers.find((item) => item.id === paperId)
    if (!paper) {
      setNotice('没有找到这套导入卷。')
      return
    }

    const nextPapers = imports.papers.filter((item) => item.id !== paperId)
    const nextQuestions = imports.questions.filter((question) => question.paperId !== paperId)
    setImports({ papers: nextPapers, questions: nextQuestions })
    saveImports(nextPapers, nextQuestions)
    setState((current) => {
      const nextAttempts = { ...current.attempts }
      delete nextAttempts[paperId]
      if (current.selectedPaperId !== paperId) {
        return { ...current, attempts: nextAttempts }
      }
      const fallbackPaper = seedPapers.find((item) => item.courseId === paper.courseId) ?? seedPapers[0]
      return {
        ...current,
        attempts: nextAttempts,
        selectedCourseId: fallbackPaper.courseId,
        selectedPaperId: fallbackPaper.id,
        selectedQuestionIndex: 0,
        view: current.view === 'resources' ? 'resources' : 'papers',
      }
    })
    setNotice(`已删除本地导入卷：${paper.title}。`)
  }

  function exportImportedPaper(paperId: string) {
    const paper = imports.papers.find((item) => item.id === paperId)
    if (!paper) {
      setNotice('没有找到这套导入卷。')
      return
    }
    const bank = {
      papers: [paper],
      questions: imports.questions.filter((question) => question.paperId === paperId),
    }
    downloadJson(`${paper.id}.json`, bank)
    setNotice(`已导出 ${paper.title}。`)
  }

  function exportAllImports() {
    if (!imports.papers.length) {
      setNotice('还没有导入卷可以备份。')
      return
    }
    downloadJson(`zikao-biguo-imports-${new Date().toISOString().slice(0, 10)}.json`, imports)
    setNotice(`已导出 ${imports.papers.length} 套导入卷备份。`)
  }

  function handleImport(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as ImportedBank
        importBank(parsed)
      } catch (error) {
        setNotice(`导入失败：${error instanceof Error ? error.message : '文件格式不正确'}`)
      }
    }
    reader.readAsText(file)
  }

  function downloadImportTemplate() {
    downloadJson('zikao-import-template.json', importTemplate)
  }

  function clearData() {
    clearAllStorage()
    setState(defaultState)
    setImports({ papers: [], questions: [] })
    setReviewPaper(null)
    setNotice('本地数据已重置。')
  }

  return (
    <main className="app-shell">
      <aside className="course-rail" aria-label="科目导航">
        <div className="brand-block">
          <div className="brand-mark">
            <BookOpenCheck size={24} />
          </div>
          <div>
            <p className="eyebrow">上海自考</p>
            <h1>自考必过舱</h1>
          </div>
        </div>

        <div className="course-list">
          {courses.map((course) => {
            const paperCount = visiblePapers.filter((paper) => paper.courseId === course.id).length
            return (
              <button
                key={course.id}
                className={`course-button ${course.id === selectedCourse.id ? 'active' : ''}`}
                type="button"
                onClick={() => selectCourse(course.id)}
                style={{ '--course-color': course.color } as CSSProperties}
              >
                <span className="course-code">{course.code}</span>
                <span>
                  <strong>{course.shortName}</strong>
                  <small>{paperCount} 套训练</small>
                </span>
              </button>
            )
          })}
        </div>

        <nav className="rail-nav" aria-label="功能导航">
          <button className={state.view === 'practice' ? 'active' : ''} type="button" onClick={() => patchState({ view: 'practice' })}>
            <FileQuestion size={18} />
            刷题
          </button>
          <button className={state.view === 'study' ? 'active' : ''} type="button" onClick={() => patchState({ view: 'study' })}>
            <MapPinned size={18} />
            学习
          </button>
          <button className={state.view === 'papers' ? 'active' : ''} type="button" onClick={() => patchState({ view: 'papers' })}>
            <History size={18} />
            真题
          </button>
          <button className={state.view === 'mistakes' ? 'active' : ''} type="button" onClick={() => patchState({ view: 'mistakes' })}>
            <ClipboardList size={18} />
            错题
          </button>
          <button className={state.view === 'resources' ? 'active' : ''} type="button" onClick={() => patchState({ view: 'resources' })}>
            <LibraryBig size={18} />
            资源
          </button>
          <button className={state.view === 'settings' ? 'active' : ''} type="button" onClick={() => patchState({ view: 'settings' })}>
            <Settings size={18} />
            设置
          </button>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">上海电机学院 · 数字媒体艺术（专升本）</p>
            <h2>{selectedCourse.name}</h2>
          </div>
          <div className="topbar-stats">
            <span>{selectedCourse.credits} 学分</span>
            <span>{selectedCourse.examMinutes} 分钟</span>
            <span>{selectedCourse.passScore} 分及格</span>
          </div>
        </header>

        <div className="notice-bar">
          <Sparkles size={16} />
          <span>{notice}</span>
        </div>

        <CourseProgressBoard
          course={selectedCourse}
          summary={courseProgress}
          onOpenPapers={() => patchState({ view: 'papers' })}
          onOpenMistakes={() => patchState({ view: 'mistakes' })}
        />

        <CourseStudyQueue
          tasks={courseStudyTasks}
          onOpenPaper={selectPaper}
          onOpenMistakes={() => patchState({ view: 'mistakes' })}
          onOpenPapers={() => patchState({ view: 'papers' })}
        />

        {state.view === 'practice' && (
          <section className="practice-grid">
            <div className="paper-panel">
              <div className="panel-heading">
                <p className="eyebrow">当前试卷</p>
                <h3>{selectedPaper.title}</h3>
                <p>{selectedPaper.description}</p>
              </div>
              <div className="score-strip">
                <div>
                  <strong>{score}</strong>
                  <span>当前得分</span>
                </div>
                <div>
                  <strong>{progress}%</strong>
                  <span>已判题</span>
                </div>
                <div>
                  <strong>{paperQuestions.length}</strong>
                  <span>题目</span>
                </div>
              </div>
              <div className="progress-line">
                <span style={{ width: `${progress}%` }} />
              </div>
              <div className="question-map" aria-label="题号导航">
                {paperQuestions.map((question, index) => {
                  const record = currentAttempt.answers[question.id]
                  return (
                    <button
                      key={question.id}
                      className={index === state.selectedQuestionIndex ? 'active' : record?.checked ? 'checked' : ''}
                      type="button"
                      onClick={() => patchState({ selectedQuestionIndex: index })}
                    >
                      {index + 1}
                    </button>
                  )
                })}
              </div>
              <div className="paper-actions">
                <button className="primary" type="button" onClick={submitPaper}>
                  <Trophy size={16} />
                  交卷
                </button>
                <button type="button" onClick={() => resetPaper(selectedPaper)}>
                  <RotateCcw size={16} />
                  重刷本卷
                </button>
                <button type="button" onClick={() => patchState({ view: 'papers' })}>
                  <History size={16} />
                  换试卷
                </button>
              </div>
            </div>

            <article className="question-card">
              {selectedPaper.status !== 'ready' || !currentQuestion ? (
                <EmptyPaper paper={selectedPaper} onImport={() => patchState({ view: 'resources' })} />
              ) : (
                <>
                  <div className="question-meta">
                    <span>{questionLabel(currentQuestion.type)}</span>
                    <span>{currentQuestion.points} 分</span>
                    <span>{currentQuestion.difficulty}</span>
                    <span>{sourceLabel(currentQuestion.sourceKind)}</span>
                  </div>
                  <h3>{currentQuestion.stem}</h3>

                  {(currentQuestion.type === 'single' || currentQuestion.type === 'multiple') && (
                    <div className="option-list">
                      {currentQuestion.options?.map((option, index) => {
                        const letter = getOptionLetter(index)
                        const chosen = currentRecord?.answer.includes(letter)
                        const checked = Boolean(currentRecord?.checked)
                        const isCorrectAnswer = currentQuestion.answer.includes(letter)
                        const optionClassName = [
                          chosen ? 'chosen' : '',
                          checked && isCorrectAnswer ? 'correct' : '',
                          checked && chosen && !isCorrectAnswer ? 'wrong' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')
                        return (
                          <button
                            key={letter}
                            className={optionClassName}
                            type="button"
                            onClick={() => answerChoice(currentQuestion, letter)}
                          >
                            <span>{letter}</span>
                            {option}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {(currentQuestion.type === 'short' || currentQuestion.type === 'essay') && (
                    <div className="text-answer">
                      <textarea
                        value={currentRecord?.textAnswer ?? ''}
                        placeholder="先按自己的记忆作答。提交后可看参考要点，也可以点 AI 评价。"
                        onChange={(event) => answerText(currentQuestion, event.target.value)}
                      />
                      <div className="rubric-chips">
                        {currentQuestion.rubric?.map((item) => <span key={item}>{item}</span>)}
                      </div>
                    </div>
                  )}

                  <div className="question-actions">
                    <button type="button" onClick={() => goQuestion(-1)} disabled={state.selectedQuestionIndex === 0}>
                      <ChevronLeft size={18} />
                      上一题
                    </button>
                    {(currentQuestion.type === 'short' || currentQuestion.type === 'essay') && (
                      <>
                        <button className="primary" type="button" onClick={() => checkQuestion(currentQuestion)}>
                          <CheckCircle2 size={18} />
                          判题
                        </button>
                        <button type="button" onClick={() => reviewWithAi(currentQuestion)}>
                          <BrainCircuit size={18} />
                          AI 评价
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => goQuestion(1)}
                      disabled={state.selectedQuestionIndex >= paperQuestions.length - 1}
                    >
                      下一题
                      <ChevronRight size={18} />
                    </button>
                  </div>

                  {currentRecord?.checked && (
                    <section className="analysis-panel">
                      <div className="analysis-score">
                        {getQuestionScore(currentQuestion, currentRecord) >= currentQuestion.points ? (
                          <CheckCircle2 size={20} />
                        ) : (
                          <XCircle size={20} />
                        )}
                        <strong>{getQuestionStatus(currentQuestion, currentRecord)}</strong>
                        <span>
                          {getQuestionScore(currentQuestion, currentRecord)} / {currentQuestion.points} 分
                        </span>
                      </div>
                      <div>
                        <p className="eyebrow">参考要点</p>
                        <ul>
                          {currentQuestion.answer.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <p>{currentQuestion.analysis}</p>
                    </section>
                  )}

                  {aiReview?.questionId === currentQuestion.id && (
                    <section className="ai-panel">
                      <div>
                        <BrainCircuit size={20} />
                        <strong>{aiReview.loading ? 'AI 正在评价' : 'AI 评价'}</strong>
                      </div>
                      <p>{aiReview.content}</p>
                    </section>
                  )}
                </>
              )}
            </article>

            <aside className="insight-panel">
              <p className="eyebrow">本课复习范围</p>
              <div className="outline-stack">
                {selectedCourse.outline.map((chapter) => (
                  <details key={chapter.id} open={chapter.id === currentQuestion?.chapterId}>
                    <summary>{chapter.title}</summary>
                    <div>
                      {chapter.focus.map((focus) => (
                        <span key={focus}>{focus}</span>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
              <div className="source-card">
                <p className="eyebrow">课程口径</p>
                <p>{selectedCourse.note}</p>
              </div>
            </aside>
          </section>
        )}

        {state.view === 'report' && (
          <ReportView
            course={selectedCourse}
            paper={selectedPaper}
            questions={paperQuestions}
            answers={currentAttempt.answers}
            onBack={() => patchState({ view: 'practice' })}
            onRetry={() => resetPaper(selectedPaper)}
            onOpenQuestion={(question) => {
              patchState({
                view: 'practice',
                selectedQuestionIndex: Math.max(selectedPaper.questionIds.indexOf(question.id), 0),
              })
            }}
          />
        )}

        {state.view === 'study' && (
          <StudyView
            course={selectedCourse}
            rows={chapterStudyRows}
            papers={coursePapers}
            onPracticeChapter={startChapterPractice}
            onOpenPapers={() => patchState({ view: 'papers' })}
            onOpenResources={() => patchState({ view: 'resources' })}
          />
        )}

        {state.view === 'papers' && (
          <PapersView
            papers={coursePapers}
            questionById={questionById}
            attempts={state.attempts}
            passScore={selectedCourse.passScore}
            selectedPaperId={selectedPaper.id}
            onSelect={selectPaper}
          />
        )}

        {state.view === 'mistakes' && (
          <MistakesView
            items={mistakeItems}
            onReview={startMistakeReview}
            onOpen={(item) => {
              const paper = item.paper ?? allPapers.find((paperItem) => paperItem.id === item.question.paperId)
              if (!paper) return
              patchState({
                selectedCourseId: paper.courseId,
                selectedPaperId: paper.id,
                selectedQuestionIndex: Math.max(paper.questionIds.indexOf(item.question.id), 0),
                view: 'practice',
              })
            }}
          />
        )}

        {state.view === 'resources' && (
          <ResourcesView
            selectedCourse={selectedCourse}
            selectedPaper={selectedPaper}
            allPapers={visiblePapers}
            importedBank={imports}
            importedCount={imports.questions.length}
            onImport={handleImport}
            onImportBank={(bank, messagePrefix) => importBank(bank, messagePrefix)}
            onDownloadTemplate={downloadImportTemplate}
            onExportAllImports={exportAllImports}
            onExportImportedPaper={exportImportedPaper}
            onDeleteImportedPaper={deleteImportedPaper}
            onOpenPaper={selectPaper}
          />
        )}

        {state.view === 'settings' && (
          <SettingsView
            apiKey={state.deepseekApiKey}
            onApiKeyChange={(deepseekApiKey) => patchState({ deepseekApiKey })}
            onClear={clearData}
          />
        )}
      </section>

      <nav className="mobile-nav" aria-label="移动端导航">
        {(
          [
          ['practice', FileQuestion, '刷题'],
          ['study', MapPinned, '学习'],
          ['papers', History, '真题'],
          ['mistakes', ClipboardList, '错题'],
          ['resources', LibraryBig, '资源'],
          ] as const
        ).map(([view, Icon, label]) => (
          <button
            key={String(view)}
            className={state.view === view ? 'active' : ''}
            type="button"
            onClick={() => patchState({ view: view as AppState['view'] })}
          >
            <Icon size={18} />
            {String(label)}
          </button>
        ))}
      </nav>
    </main>
  )
}

function StudyView({
  course,
  rows,
  papers,
  onPracticeChapter,
  onOpenPapers,
  onOpenResources,
}: {
  course: Course
  rows: ChapterStudyRow[]
  papers: Paper[]
  onPracticeChapter: (row: ChapterStudyRow) => void
  onOpenPapers: () => void
  onOpenResources: () => void
}) {
  const totalQuestions = rows.reduce((sum, row) => sum + row.questions.length, 0)
  const checkedQuestions = rows.reduce((sum, row) => sum + row.checkedQuestions, 0)
  const wrongQuestions = rows.reduce((sum, row) => sum + row.wrongQuestions, 0)
  const pendingPapers = papers.filter((paper) => paper.status === 'needs-import').length
  const readyPapers = papers.filter((paper) => paper.status === 'ready').length

  function rowStatus(row: ChapterStudyRow) {
    if (!row.questions.length) {
      return { label: '待补题', detail: `${row.pendingPapers} 套真题索引待整理`, tone: 'pending' }
    }
    if (row.wrongQuestions) {
      return { label: '先复盘', detail: `${row.wrongQuestions} 题最近失分`, tone: 'review' }
    }
    if (row.checkedQuestions < row.questions.length) {
      return { label: '继续刷', detail: `已判 ${row.checkedQuestions}/${row.questions.length}`, tone: 'progress' }
    }
    return { label: '可巩固', detail: `${row.questions.length} 题已覆盖`, tone: 'ready' }
  }

  return (
    <section className="study-view library-view">
      <div className="section-heading">
        <p className="eyebrow">大纲学习</p>
        <h3>{course.shortName} 章节路线</h3>
      </div>

      <div className="study-overview">
        <div>
          <MapPinned size={18} />
          <strong>{rows.length}</strong>
          <span>大纲章节</span>
        </div>
        <div>
          <FileQuestion size={18} />
          <strong>{checkedQuestions}/{totalQuestions}</strong>
          <span>题目覆盖</span>
        </div>
        <div>
          <Target size={18} />
          <strong>{wrongQuestions}</strong>
          <span>失分点</span>
        </div>
        <div>
          <History size={18} />
          <strong>{readyPapers}/{readyPapers + pendingPapers}</strong>
          <span>可刷/待补卷</span>
        </div>
      </div>

      <div className="study-route">
        <article>
          <strong>1. 大纲过点</strong>
          <span>先把本章关键词和问法看熟。</span>
        </article>
        <article>
          <strong>2. 章节专项</strong>
          <span>用本章题目检查理解，不靠眼熟。</span>
        </article>
        <article>
          <strong>3. 真题套卷</strong>
          <span>按整卷节奏补速度和主观题结构。</span>
        </article>
      </div>

      <div className="chapter-study-grid">
        {rows.map((row, index) => {
          const status = rowStatus(row)
          return (
            <article key={row.id} className="chapter-study-card">
              <div className="chapter-study-head">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{row.title}</strong>
                  <small>
                    客观题 {row.objectiveQuestions} · 大题 {row.textQuestions} · 覆盖 {row.readyPapers} 套卷
                  </small>
                </div>
                <em className={`chapter-status ${status.tone}`}>
                  <strong>{status.label}</strong>
                  <small>{status.detail}</small>
                </em>
              </div>

              <div className="chapter-focus">
                {row.focus.map((focus) => (
                  <span key={focus}>{focus}</span>
                ))}
              </div>

              <div className="chapter-plan">
                <div>
                  <strong>
                    <BookOpenCheck size={15} />
                    必背点
                  </strong>
                  <ul>
                    {row.mustKnow.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <strong>
                    <BrainCircuit size={15} />
                    常见问法
                  </strong>
                  <ul>
                    {row.questionPatterns.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <strong>
                    <CheckCircle2 size={15} />
                    复习动作
                  </strong>
                  <ul>
                    {row.studySteps.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="chapter-study-actions">
                <button className="primary" type="button" onClick={() => onPracticeChapter(row)} disabled={!row.questions.length}>
                  <PlayCircle size={16} />
                  章节专项
                </button>
                <button type="button" onClick={onOpenPapers}>
                  <History size={16} />
                  真题套卷
                </button>
              </div>
            </article>
          )
        })}
      </div>

      <div className="study-source-panel">
        <div>
          <p className="eyebrow">课程口径</p>
          <p>{course.note}</p>
        </div>
        <div className="study-source-actions">
          {course.sources.map((source) => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
              <ExternalLink size={15} />
              {source.publisher}
            </a>
          ))}
          <button type="button" onClick={onOpenResources}>
            <LibraryBig size={15} />
            资料矩阵
          </button>
        </div>
      </div>
    </section>
  )
}

function CourseProgressBoard({
  course,
  summary,
  onOpenPapers,
  onOpenMistakes,
}: {
  course: Course
  summary: CourseProgressSummary
  onOpenPapers: () => void
  onOpenMistakes: () => void
}) {
  const checkedRate = summary.totalQuestions ? Math.round((summary.checkedQuestions / summary.totalQuestions) * 100) : 0
  const nextAction = summary.wrongQuestions
    ? `${summary.wrongQuestions} 题需要回看`
    : summary.pendingPapers
      ? `${summary.pendingPapers} 套真题待导入`
      : summary.readyPapers
        ? '继续保持刷题手感'
        : '先补入一套真题'

  return (
    <section className="course-progress-board" aria-label={`${course.shortName} 学习进度`}>
      <div className="progress-head">
        <div>
          <p className="eyebrow">本课进度</p>
          <strong>{nextAction}</strong>
        </div>
        <div className="progress-actions">
          <button type="button" onClick={onOpenPapers}>
            <History size={16} />
            选卷
          </button>
          <button type="button" onClick={onOpenMistakes} disabled={!summary.wrongQuestions}>
            <ClipboardCheck size={16} />
            复盘
          </button>
        </div>
      </div>

      <div className="progress-metrics">
        <div>
          <Gauge size={18} />
          <strong>{checkedRate}%</strong>
          <span>判题进度</span>
        </div>
        <div>
          <FileQuestion size={18} />
          <strong>{summary.submittedPapers}/{summary.readyPapers}</strong>
          <span>已交卷</span>
        </div>
        <div>
          <Target size={18} />
          <strong>{summary.wrongQuestions}</strong>
          <span>待复盘</span>
        </div>
        <div>
          <History size={18} />
          <strong>{summary.pendingPapers}</strong>
          <span>待导入真题</span>
        </div>
      </div>

      <div className="progress-foot">
        <span>
          已判 {summary.checkedQuestions}/{summary.totalQuestions} 题
          {summary.inProgressPapers ? ` · ${summary.inProgressPapers} 套进行中` : ''}
        </span>
        <span>{summary.lastScore ? `最近 ${summary.lastScore.score}/${summary.lastScore.totalScore} · ${summary.lastScore.paperTitle}` : '还没有交卷记录'}</span>
      </div>
    </section>
  )
}

function CourseStudyQueue({
  tasks,
  onOpenPaper,
  onOpenMistakes,
  onOpenPapers,
}: {
  tasks: CourseStudyTask[]
  onOpenPaper: (paper: Paper) => void
  onOpenMistakes: () => void
  onOpenPapers: () => void
}) {
  function openTask(task: CourseStudyTask) {
    if (task.kind === 'review') {
      onOpenMistakes()
      return
    }
    if (task.paper) {
      onOpenPaper(task.paper)
      return
    }
    onOpenPapers()
  }

  return (
    <section className="study-queue" aria-label="本课下一步">
      <div className="study-queue-head">
        <div>
          <p className="eyebrow">本课下一步</p>
          <strong>按这个顺序推进</strong>
        </div>
        <span>继续 / 复盘 / 开新卷 / 补真题</span>
      </div>
      <div className="study-task-grid">
        {tasks.map((task) => (
          <article key={task.id} className={`study-task task-${task.kind}`}>
            <div className="study-task-icon">
              {task.kind === 'continue' && <PlayCircle size={18} />}
              {task.kind === 'review' && <ClipboardCheck size={18} />}
              {task.kind === 'start' && <FileQuestion size={18} />}
              {task.kind === 'import' && <Upload size={18} />}
              {task.kind === 'complete' && <CheckCircle2 size={18} />}
            </div>
            <div>
              <strong>{task.title}</strong>
              <small>{task.detail}</small>
            </div>
            <button type="button" onClick={() => openTask(task)}>
              {task.kind === 'import' ? <ClipboardList size={16} /> : <PlayCircle size={16} />}
              {task.actionLabel}
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}

function EmptyPaper({ paper, onImport }: { paper: Paper; onImport: () => void }) {
  return (
    <div className="empty-state">
      <Import size={32} />
      <h3>{paper.title}</h3>
      <p>{paper.description}</p>
      <button className="primary" type="button" onClick={onImport}>
        <Upload size={18} />
        去导入真题
      </button>
    </div>
  )
}

function PapersView({
  papers,
  questionById,
  attempts,
  passScore,
  selectedPaperId,
  onSelect,
}: {
  papers: Paper[]
  questionById: Map<string, Question>
  attempts: Record<string, PaperAttempt>
  passScore: number
  selectedPaperId: string
  onSelect: (paper: Paper) => void
}) {
  return (
    <section className="library-view">
      <div className="section-heading">
        <p className="eyebrow">历年真题时间轴</p>
        <h3>选择一套卷开始刷</h3>
      </div>
      <div className="paper-timeline">
        {papers.map((paper) => {
          const paperQuestions = paper.questionIds
            .map((id) => questionById.get(id))
            .filter((question): question is Question => Boolean(question))
          const typeStats = (['single', 'multiple', 'short', 'essay'] as const)
            .map((type) => ({ type, count: paperQuestions.filter((question) => question.type === type).length }))
            .filter((item) => item.count > 0)
          const status = getPaperTimelineStatus(paper, paperQuestions, attempts[paper.id], passScore)
          return (
            <button
              key={paper.id}
              className={`paper-item ${paper.id === selectedPaperId ? 'active' : ''}`}
              type="button"
              onClick={() => onSelect(paper)}
            >
              <span className="paper-year">{paper.year}</span>
              <span>
                <strong>{paper.title}</strong>
                <small>{paper.description}</small>
                <span className="paper-type-strip">
                  {typeStats.length ? (
                    typeStats.map((item) => (
                      <em key={item.type}>
                        {questionLabel(item.type)} {item.count}
                      </em>
                    ))
                  ) : (
                    <em>待导入题目</em>
                  )}
                </span>
              </span>
              <span className={`paper-status ${status.tone}`}>
                <strong>{status.label}</strong>
                <small>{status.detail}</small>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function MistakesView({
  items,
  onOpen,
  onReview,
}: {
  items: MistakeReviewItem[]
  onOpen: (item: MistakeReviewItem) => void
  onReview: (items: MistakeReviewItem[]) => void
}) {
  const [courseFilter, setCourseFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState<QuestionType | 'all'>('all')
  const [chapterFilter, setChapterFilter] = useState('all')

  const courseOptions = useMemo(() => {
    const optionMap = new Map<string, Course>()
    items.forEach((item) => optionMap.set(item.course.id, item.course))
    return Array.from(optionMap.values())
  }, [items])

  const chapterOptions = useMemo(() => {
    const optionMap = new Map<string, { id: string; title: string; courseName: string }>()
    items
      .filter((item) => courseFilter === 'all' || item.course.id === courseFilter)
      .filter((item) => typeFilter === 'all' || item.question.type === typeFilter)
      .forEach((item) => {
        optionMap.set(item.question.chapterId, {
          id: item.question.chapterId,
          title: item.chapterTitle,
          courseName: item.course.shortName,
        })
      })
    return Array.from(optionMap.values())
  }, [courseFilter, items, typeFilter])

  useEffect(() => {
    if (chapterFilter !== 'all' && !chapterOptions.some((chapter) => chapter.id === chapterFilter)) {
      setChapterFilter('all')
    }
  }, [chapterFilter, chapterOptions])

  const filteredItems = useMemo(
    () =>
      items.filter(
        (item) =>
          (courseFilter === 'all' || item.course.id === courseFilter) &&
          (typeFilter === 'all' || item.question.type === typeFilter) &&
          (chapterFilter === 'all' || item.question.chapterId === chapterFilter),
      ),
    [chapterFilter, courseFilter, items, typeFilter],
  )

  const objectiveCount = items.filter((item) => item.question.type === 'single' || item.question.type === 'multiple').length
  const textCount = items.length - objectiveCount
  const lostPoints = items.reduce((sum, item) => sum + (item.question.points - item.earned), 0)
  const chapterStats = useMemo(() => {
    const stats = new Map<string, { key: string; courseName: string; title: string; count: number; lost: number }>()
    items.forEach((item) => {
      const key = `${item.course.id}-${item.question.chapterId}`
      const current = stats.get(key) ?? {
        key,
        courseName: item.course.shortName,
        title: item.chapterTitle,
        count: 0,
        lost: 0,
      }
      current.count += 1
      current.lost += item.question.points - item.earned
      stats.set(key, current)
    })
    return Array.from(stats.values()).sort((a, b) => b.count - a.count || b.lost - a.lost)
  }, [items])

  const resetFilters = () => {
    setCourseFilter('all')
    setTypeFilter('all')
    setChapterFilter('all')
  }

  return (
    <section className="library-view">
      <div className="section-heading">
        <p className="eyebrow">错题本</p>
        <h3>{items.length ? `${items.length} 道题需要复盘` : '目前没有错题'}</h3>
      </div>

      <div className="mistake-overview">
        <div>
          <strong>{items.length}</strong>
          <span>总错题</span>
        </div>
        <div>
          <strong>{objectiveCount}</strong>
          <span>客观题</span>
        </div>
        <div>
          <strong>{textCount}</strong>
          <span>大题</span>
        </div>
        <div>
          <strong>{lostPoints}</strong>
          <span>累计失分</span>
        </div>
      </div>

      {items.length > 0 && (
        <>
          <div className="mistake-filters" aria-label="错题筛选">
            <label>
              <span>科目</span>
              <select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
                <option value="all">全部科目</option>
                {courseOptions.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} {course.shortName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>题型</span>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as QuestionType | 'all')}>
                <option value="all">全部题型</option>
                <option value="single">单选</option>
                <option value="multiple">多选</option>
                <option value="short">简答</option>
                <option value="essay">论述</option>
              </select>
            </label>
            <label>
              <span>章节</span>
              <select value={chapterFilter} onChange={(event) => setChapterFilter(event.target.value)}>
                <option value="all">全部章节</option>
                {chapterOptions.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.courseName} · {chapter.title}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={resetFilters}>
              <ListFilter size={16} />
              清空筛选
            </button>
          </div>

          <div className="mistake-actions">
            <button className="primary" type="button" onClick={() => onReview(filteredItems)} disabled={!filteredItems.length}>
              <PlayCircle size={16} />
              按当前筛选重刷
            </button>
            <span>
              {filteredItems.length
                ? `将 ${filteredItems.length} 道错题组成一套专项卷，答对后按最新判题结果移出错题本。`
                : '当前筛选没有可重刷题目。'}
            </span>
          </div>

          <div className="mistake-focus">
            <p className="eyebrow">优先复盘章节</p>
            <div>
              {chapterStats.slice(0, 3).map((chapter) => (
                <span key={chapter.key}>
                  <strong>{chapter.courseName}</strong>
                  {chapter.title} · {chapter.count} 题 · 失 {chapter.lost} 分
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="mistake-list">
        {filteredItems.map((item) => (
          <button key={item.question.id} type="button" onClick={() => onOpen(item)}>
            <span className="mistake-type">{questionLabel(item.question.type)}</span>
            <span>
              <strong>{item.question.stem}</strong>
              <small>
                {item.course.shortName} · {item.chapterTitle} · {item.paper?.title ?? '本地题库'}
              </small>
              <small>{item.question.tags.join(' / ')}</small>
            </span>
            <span className="mistake-score">
              <strong>{item.earned}/{item.question.points}</strong>
              <small>上次得分</small>
            </span>
          </button>
        ))}
      </div>

      {items.length > 0 && !filteredItems.length && (
        <div className="compact-empty">当前筛选下没有错题，可以换一个科目、题型或章节。</div>
      )}

      {!items.length && (
        <div className="empty-state">
          <CheckCircle2 size={32} />
          <p>先刷一套卷，判题后这里会自动收集需要复盘的题。</p>
        </div>
      )}
    </section>
  )
}

function ReportView({
  course,
  paper,
  questions,
  answers,
  onBack,
  onRetry,
  onOpenQuestion,
}: {
  course: (typeof courses)[number]
  paper: Paper
  questions: Question[]
  answers: Record<string, AnswerRecord>
  onBack: () => void
  onRetry: () => void
  onOpenQuestion: (question: Question) => void
}) {
  const possibleScore = questions.reduce((sum, question) => sum + question.points, 0)
  const earnedScore = questions.reduce((sum, question) => sum + getQuestionScore(question, answers[question.id]), 0)
  const scaledScore = possibleScore ? Math.round((earnedScore / possibleScore) * paper.totalScore) : 0
  const pass = scaledScore >= course.passScore
  const answeredCount = questions.filter((question) => {
    const record = answers[question.id]
    return Boolean(record?.answer.length || record?.textAnswer.trim())
  }).length
  const wrongQuestions = questions.filter((question) => getQuestionScore(question, answers[question.id]) < question.points)
  const typeStats = (['single', 'multiple', 'short', 'essay'] as const)
    .map((type) => {
      const scoped = questions.filter((question) => question.type === type)
      const total = scoped.reduce((sum, question) => sum + question.points, 0)
      const earned = scoped.reduce((sum, question) => sum + getQuestionScore(question, answers[question.id]), 0)
      return { type, count: scoped.length, earned, total }
    })
    .filter((item) => item.count)
  const chapterStats = course.outline
    .map((chapter) => {
      const scoped = questions.filter((question) => question.chapterId === chapter.id)
      const total = scoped.reduce((sum, question) => sum + question.points, 0)
      const earned = scoped.reduce((sum, question) => sum + getQuestionScore(question, answers[question.id]), 0)
      const rate = total ? earned / total : 1
      return { chapter, count: scoped.length, earned, total, rate }
    })
    .filter((item) => item.count)
    .sort((a, b) => a.rate - b.rate)

  return (
    <section className="report-view">
      <div className="report-hero">
        <div>
          <p className="eyebrow">整卷报告</p>
          <h3>{paper.title}</h3>
          <p>{pass ? '已达到当前课程及格线。' : '还没到 60 分线，先从薄弱章节和错题重刷。'}</p>
        </div>
        <div className={`report-score ${pass ? 'pass' : ''}`}>
          <strong>{scaledScore}</strong>
          <span>折算 / {paper.totalScore}</span>
          <em>{pass ? '通过线以上' : '需要复盘'}</em>
        </div>
      </div>

      <div className="report-actions">
        <button className="primary" type="button" onClick={onBack}>
          <FileQuestion size={18} />
          回到试卷
        </button>
        <button type="button" onClick={onRetry}>
          <RotateCcw size={18} />
          重刷本卷
        </button>
      </div>

      <div className="report-grid">
        <div className="report-card">
          <p className="eyebrow">概览</p>
          <div className="metric-list">
            <div>
              <strong>{earnedScore}/{possibleScore}</strong>
              <span>卷面得分</span>
            </div>
            <div>
              <strong>{answeredCount}/{questions.length}</strong>
              <span>已作答</span>
            </div>
            <div>
              <strong>{wrongQuestions.length}</strong>
              <span>待复盘</span>
            </div>
          </div>
        </div>

        <div className="report-card">
          <p className="eyebrow">题型得分</p>
          <div className="stat-bars">
            {typeStats.map((item) => (
              <div key={item.type}>
                <span>{questionLabel(item.type)}</span>
                <strong>{item.earned}/{item.total}</strong>
                <em>
                  <i style={{ width: `${item.total ? Math.round((item.earned / item.total) * 100) : 0}%` }} />
                </em>
              </div>
            ))}
          </div>
        </div>

        <div className="report-card">
          <p className="eyebrow">薄弱章节</p>
          <div className="chapter-rank">
            {chapterStats.slice(0, 4).map((item) => (
              <div key={item.chapter.id}>
                <strong>{item.chapter.title}</strong>
                <span>{item.earned}/{item.total} 分 · {item.count} 题</span>
              </div>
            ))}
          </div>
        </div>

        <div className="report-card wrong-review">
          <p className="eyebrow">错题回跳</p>
          {wrongQuestions.length ? (
            <div className="wrong-list">
              {wrongQuestions.map((question) => (
                <button key={question.id} type="button" onClick={() => onOpenQuestion(question)}>
                  <span>{questionLabel(question.type)}</span>
                  <strong>{question.stem}</strong>
                  <small>{getQuestionScore(question, answers[question.id])}/{question.points} 分</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="compact-empty">这套卷暂时没有错题，下一步可以重刷真题保持手感。</div>
          )}
        </div>
      </div>
    </section>
  )
}

type BuilderPreview = {
  bank: ImportedBank
  warnings: string[]
}

function getPreviewStats(bank: ImportedBank) {
  const questions = bank.questions
  return {
    total: questions.length,
    objective: questions.filter((question) => question.type === 'single' || question.type === 'multiple').length,
    text: questions.filter((question) => question.type === 'short' || question.type === 'essay').length,
    missingAnswer: questions.filter((question) => question.answer.includes('待补充答案')).length,
    missingAnalysis: questions.filter((question) => question.analysis.includes('暂未提供解析')).length,
    score: questions.reduce((sum, question) => sum + question.points, 0),
  }
}

function formatAnswerForEditor(question: Question) {
  if (question.answer.includes('待补充答案')) {
    return ''
  }
  if (question.type === 'single' || question.type === 'multiple') {
    return question.answer.join(',')
  }
  return question.answer.join('\n')
}

function parseAnswerFromEditor(question: Question, value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ['待补充答案']
  }
  if (question.type === 'single' || question.type === 'multiple') {
    const letters = Array.from(new Set(trimmed.toUpperCase().match(/[A-H]/g) ?? []))
    return letters.length ? letters : ['待补充答案']
  }
  return trimmed
    .split(/\n|；|;/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function readPositiveInteger(value: string, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback
}

function ResourcesView({
  selectedCourse,
  selectedPaper,
  allPapers,
  importedBank,
  importedCount,
  onImport,
  onImportBank,
  onDownloadTemplate,
  onExportAllImports,
  onExportImportedPaper,
  onDeleteImportedPaper,
  onOpenPaper,
}: {
  selectedCourse: (typeof courses)[number]
  selectedPaper: Paper
  allPapers: Paper[]
  importedBank: ImportedBank
  importedCount: number
  onImport: (file: File) => void
  onImportBank: (bank: ImportedBank, messagePrefix?: string) => void
  onDownloadTemplate: () => void
  onExportAllImports: () => void
  onExportImportedPaper: (paperId: string) => void
  onDeleteImportedPaper: (paperId: string) => void
  onOpenPaper: (paper: Paper) => void
}) {
  const [builderCourseId, setBuilderCourseId] = useState(selectedCourse.id)
  const [builderYear, setBuilderYear] = useState(new Date().getFullYear())
  const [builderSession, setBuilderSession] = useState<Paper['session']>('4月')
  const [builderTitle, setBuilderTitle] = useState(`${selectedCourse.code} ${new Date().getFullYear()} 年4月真题导入卷`)
  const [pastedText, setPastedText] = useState('')
  const [builderMessage, setBuilderMessage] = useState('支持每题带答案，也支持卷尾统一“参考答案”。')
  const [builderPreview, setBuilderPreview] = useState<BuilderPreview | null>(null)
  const [prefilledPaperId, setPrefilledPaperId] = useState<string | null>(null)
  const importedQuestionCount = (paperId: string) =>
    importedBank.questions.filter((question) => question.paperId === paperId).length
  const importedQuestionsForPaper = (paper: Paper) => {
    const byId = new Map(importedBank.questions.map((question) => [question.id, question]))
    const ordered = paper.questionIds.map((questionId) => byId.get(questionId)).filter((question): question is Question => Boolean(question))
    return ordered.length ? ordered : importedBank.questions.filter((question) => question.paperId === paper.id)
  }
  const targetCourses = courses.filter((course) => ['xi', 'history', 'marx', 'multimedia'].includes(course.id))
  const courseCoverage = targetCourses.map((course) => {
    const coursePapers = allPapers.filter((paper) => paper.courseId === course.id)
    const gapRecords = sourceGapRecords.filter((record) => record.courseId === course.id)
    return {
      course,
      readyPapers: coursePapers.filter((paper) => paper.status === 'ready'),
      pendingPapers: coursePapers.filter((paper) => paper.status === 'needs-import'),
      readyCount: coursePapers.filter((paper) => paper.status === 'ready').length,
      importedCount: importedBank.papers.filter((paper) => paper.courseId === course.id).length,
      waitingCount: coursePapers.filter((paper) => paper.status === 'needs-import').length,
      loginGapCount: gapRecords.filter((record) => record.accessStatus === 'requires-login-or-purchase').length,
      previewGapCount: gapRecords.filter((record) => record.accessStatus !== 'requires-login-or-purchase').length,
      gapRecords,
    }
  })
  const loginGapRecords = sourceGapRecords.filter((record) => record.accessStatus === 'requires-login-or-purchase')
  const previewGapRecords = sourceGapRecords.filter((record) => record.accessStatus !== 'requires-login-or-purchase')

  function prefillBuilderFromPaper(paper: Paper) {
    const course = courses.find((item) => item.id === paper.courseId) ?? selectedCourse
    setBuilderCourseId(course.id)
    setBuilderYear(paper.year)
    setBuilderSession(paper.session)
    setBuilderTitle(`${paper.title}导入卷`)
    setPastedText('')
    setBuilderPreview(null)
    setPrefilledPaperId(paper.id)
    setBuilderMessage(`已预填 ${paper.title}。找到题文后粘贴进来，点“解析预览”。`)
  }

  useEffect(() => {
    if (selectedPaper.status !== 'needs-import' || selectedPaper.id === prefilledPaperId) {
      return
    }

    const course = courses.find((item) => item.id === selectedPaper.courseId) ?? selectedCourse
    setBuilderCourseId(course.id)
    setBuilderYear(selectedPaper.year)
    setBuilderSession(selectedPaper.session)
    setBuilderTitle(`${selectedPaper.title}导入卷`)
    setPastedText('')
    setBuilderPreview(null)
    setPrefilledPaperId(selectedPaper.id)
    setBuilderMessage(`已预填 ${selectedPaper.title}。找到题文后粘贴进来，点“解析预览”。`)
  }, [prefilledPaperId, selectedCourse, selectedPaper])

  async function copySearchQuery(query: string) {
    try {
      await navigator.clipboard.writeText(query)
      setBuilderMessage(`已复制检索词：${query}`)
    } catch {
      setBuilderMessage(`复制失败，可以手动搜索：${query}`)
    }
  }

  function buildPaperFromText() {
    const course = courses.find((item) => item.id === builderCourseId) ?? selectedCourse
    const result = parsePastedPaperText(pastedText, course, {
      courseId: course.id,
      title: builderTitle,
      year: builderYear,
      session: builderSession,
    })

    if (!result.bank.questions.length) {
      setBuilderPreview(null)
      setBuilderMessage(result.warnings.join('；') || '没有识别到题目。')
      return
    }

    setBuilderPreview(result)
    setBuilderMessage(
      `已生成预览：${result.bank.questions.length} 道题。确认无误后再导入，或修改文本后重新解析。`,
    )
  }

  function importBuilderPreview() {
    if (!builderPreview?.bank.questions.length) {
      setBuilderMessage('还没有可导入的预览。')
      return
    }

    onImportBank(builderPreview.bank, '已从预览确认导入')
    setBuilderMessage(`已导入 ${builderPreview.bank.questions.length} 道题。`)
    setBuilderPreview(null)
  }

  function loadImportedPaperToPreview(paper: Paper) {
    const questions = importedQuestionsForPaper(paper)
    if (!questions.length) {
      setBuilderMessage(`${paper.title} 没有找到题目，无法校正。`)
      return
    }

    setBuilderCourseId(paper.courseId)
    setBuilderYear(paper.year)
    setBuilderSession(paper.session)
    setBuilderTitle(paper.title)
    setPastedText('')
    setBuilderPreview({
      bank: {
        papers: [paper],
        questions,
      },
      warnings: [],
    })
    setBuilderMessage(`已载入 ${paper.title}。修正答案或解析后，点“确认导入”覆盖保存。`)
  }

  function updatePreviewPaper(patch: Partial<Paper>) {
    setBuilderPreview((current) => {
      if (!current) {
        return current
      }

      const nextPaper = current.bank.papers[0]

      return {
        ...current,
        bank: {
          ...current.bank,
          papers: nextPaper ? [{ ...nextPaper, ...patch }] : [],
        },
      }
    })
  }

  function updatePreviewQuestion(questionId: string, patch: Partial<Question>) {
    setBuilderPreview((current) => {
      if (!current) {
        return current
      }

      const nextQuestions = current.bank.questions.map((question) =>
        question.id === questionId
          ? {
              ...question,
              ...patch,
            }
          : question,
      )
      const nextPaper = current.bank.papers[0]

      return {
        ...current,
        bank: {
          papers: nextPaper ? [nextPaper] : [],
          questions: nextQuestions,
        },
      }
    })
  }

  function updatePreviewPaperScore(value: string) {
    updatePreviewPaper({ totalScore: readPositiveInteger(value, previewPaper?.totalScore ?? 100) })
  }

  function syncPreviewPaperScore() {
    if (!previewStats) {
      setBuilderMessage('还没有可同步的题目合计。')
      return
    }

    updatePreviewPaper({ totalScore: Math.max(previewStats.score, 1) })
    setBuilderMessage(`已把整卷满分同步为题目合计 ${previewStats.score} 分。`)
  }

  function updatePreviewQuestionPoints(question: Question, value: string) {
    updatePreviewQuestion(question.id, { points: readPositiveInteger(value, question.points) })
  }

  function updatePreviewAnswer(question: Question, value: string) {
    const answer = parseAnswerFromEditor(question, value)
    updatePreviewQuestion(question.id, {
      answer,
      rubric: question.type === 'short' || question.type === 'essay' ? answer.filter((item) => item !== '待补充答案').slice(0, 6) : undefined,
    })
  }

  function downloadBuilderPreview() {
    if (!builderPreview?.bank.questions.length) {
      setBuilderMessage('还没有可下载的预览。')
      return
    }

    const paper = builderPreview.bank.papers[0]
    downloadJson(`${paper?.id ?? 'zikao-paper-preview'}.json`, builderPreview.bank)
    setBuilderMessage('已下载当前预览 JSON。')
  }

  const previewPaper = builderPreview?.bank.papers[0]
  const previewStats = builderPreview ? getPreviewStats(builderPreview.bank) : null

  return (
    <section className="resources-view">
      <div className="section-heading">
        <p className="eyebrow">资料与题库</p>
        <h3>找真题、粘贴整理、马上开刷</h3>
      </div>

      <div className="resource-grid">
        <div className="resource-box">
          <div>
            <Download size={22} />
            <strong>导入真题 JSON</strong>
          </div>
          <p>把 PDF/Word 真题整理成模板格式后导入，即可出现在“历年真题”里选择开刷。</p>
          <label className="file-button">
            <Upload size={18} />
            选择 JSON 文件
            <input
              type="file"
              accept="application/json"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) onImport(file)
                event.currentTarget.value = ''
              }}
            />
          </label>
          <button type="button" onClick={onDownloadTemplate}>
            <Download size={18} />
            下载导入模板
          </button>
          <button type="button" onClick={onExportAllImports}>
            <Download size={18} />
            备份全部导入卷
          </button>
          <small>已导入 {importedCount} 道本地题。</small>
        </div>

        <div className="resource-box coverage-box">
          <div>
            <FileQuestion size={22} />
            <strong>真题补齐进度</strong>
          </div>
          <p>先把公共课和计算机的 4 月/10 月卷补进来。旧代码 03708/03709 会按新代码一起显示。</p>
          <div className="coverage-list">
            {courseCoverage.map(({ course, readyCount, importedCount: localCount, waitingCount }) => (
              <div key={course.id}>
                <span className="course-code" style={{ '--course-color': course.color } as CSSProperties}>
                  {course.code}
                </span>
                <strong>{course.shortName}</strong>
                <small>{readyCount} 套可刷 · {localCount} 套本地导入 · {waitingCount} 套待补</small>
              </div>
            ))}
          </div>
        </div>

        <div className="resource-box gap-tracker">
          <div>
            <KeyRound size={22} />
            <strong>待登录资料队列</strong>
          </div>
          <p>这些来源我已经验证过，不是没找到，而是需要登录/购买或只公开预览。登录后优先处理这里。</p>
          <div className="gap-summary">
            <div>
              <strong>{loginGapRecords.length}</strong>
              <span>需要登录</span>
            </div>
            <div>
              <strong>{previewGapRecords.length}</strong>
              <span>仅预览/答案受限</span>
            </div>
            <div>
              <strong>{sourceGapRecords.length}</strong>
              <span>已验证线索</span>
            </div>
          </div>
          <div className="gap-list">
            {sourceGapRecords.map((record) => {
              const course = courses.find((item) => item.id === record.courseId)
              const statusLabel =
                record.accessStatus === 'requires-login-or-purchase'
                  ? '待登录'
                  : record.accessStatus === 'public-preview-only'
                    ? '只有预览'
                    : '答案受限'
              return (
                <article key={`${record.courseId}-${record.sourceUrl}-${record.title}`} className={`gap-item gap-${record.accessStatus}`}>
                  <div>
                    <span>{course?.shortName ?? record.code}</span>
                    <strong>{record.title}</strong>
                    <small>{record.coverage}</small>
                    <small>{record.currentUse}</small>
                  </div>
                  <div>
                    <em>{statusLabel}</em>
                    <a href={record.sourceUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={15} />
                      打开
                    </a>
                  </div>
                </article>
              )
            })}
          </div>
        </div>

        <div className="resource-box paper-matrix">
          <div>
            <Search size={22} />
            <strong>真题补齐矩阵</strong>
          </div>
          <p>按备考优先级盯住四门课。待导入项先作为索引存在，拿到题文后可以直接预填到制卷器。</p>
          <div className="matrix-list">
            {courseCoverage.map(({ course, readyPapers, pendingPapers, readyCount, importedCount: localCount, waitingCount, loginGapCount, previewGapCount, gapRecords }) => {
              const query = getPastPaperSearchQuery(course)
              const sourceLinks = pastPaperSources.filter((source) => source.courseIds.includes(course.id)).slice(0, 3)
              return (
                <section key={course.id} className="matrix-course" style={{ '--course-color': course.color } as CSSProperties}>
                  <div className="matrix-course-head">
                    <span className="course-code" style={{ '--course-color': course.color } as CSSProperties}>
                      {course.code}
                    </span>
                    <div>
                      <strong>{course.shortName}</strong>
                      <small>{course.legacyCodes?.length ? `旧代码 ${course.legacyCodes.join(' / ')}` : course.category}</small>
                    </div>
                    <div className="matrix-counts">
                      <span>{readyCount} 可刷</span>
                      <span>{localCount} 本地</span>
                      <span>{waitingCount} 待补</span>
                      {!!loginGapCount && <span>{loginGapCount} 待登录</span>}
                      {!!previewGapCount && <span>{previewGapCount} 预览</span>}
                    </div>
                  </div>

                  <div className="matrix-actions">
                    <a href={getSearchUrl(query)} target="_blank" rel="noreferrer">
                      <Search size={16} />
                      搜索真题
                    </a>
                    <button type="button" onClick={() => copySearchQuery(query)}>
                      <Copy size={16} />
                      复制检索词
                    </button>
                  </div>

                  <small className="search-query">{query}</small>

                  <div className="matrix-links">
                    {sourceLinks.map((source) => (
                      <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                        <ExternalLink size={14} />
                        {source.publisher}
                      </a>
                    ))}
                  </div>

                  {gapRecords.length > 0 && (
                    <div className="matrix-gap-links">
                      {gapRecords.slice(0, 2).map((record) => (
                        <a key={`${record.sourceUrl}-${record.title}`} href={record.sourceUrl} target="_blank" rel="noreferrer">
                          <KeyRound size={14} />
                          {record.accessStatus === 'requires-login-or-purchase' ? '待登录' : '线索'} · {record.coverage}
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="pending-paper-list">
                    {pendingPapers.length ? (
                      pendingPapers
                        .slice()
                        .sort((a, b) => b.year - a.year || a.title.localeCompare(b.title))
                        .map((paper) => (
                          <div key={paper.id} className="pending-paper">
                            <div>
                              <strong>{paper.title}</strong>
                              <small>{paper.description}</small>
                            </div>
                            <button type="button" onClick={() => prefillBuilderFromPaper(paper)}>
                              <ClipboardList size={16} />
                              预填制卷
                            </button>
                          </div>
                        ))
                    ) : (
                      <div className="compact-empty">暂无待导入索引，先刷已内置卷。</div>
                    )}
                  </div>

                  <small>{readyPapers.map((paper) => paper.title).slice(0, 2).join(' / ') || '暂无可刷内置卷'}</small>
                </section>
              )
            })}
          </div>
        </div>

        <div className="resource-box paste-builder">
          <div>
            <ClipboardList size={22} />
            <strong>粘贴文本制卷</strong>
          </div>
          <p>从网页、PDF OCR 或 Word 里复制题目，支持逐题答案，也支持最后统一答案表，系统会拆成可刷试卷。</p>
          <div className="builder-fields">
            <label>
              <span>科目</span>
              <select
                value={builderCourseId}
                onChange={(event) => {
                  const nextCourse = courses.find((course) => course.id === event.target.value) ?? selectedCourse
                  setBuilderCourseId(nextCourse.id)
                  setBuilderTitle(`${nextCourse.code} ${builderYear} 年${builderSession}真题导入卷`)
                  setBuilderPreview(null)
                }}
              >
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} {course.shortName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>年份</span>
              <input
                type="number"
                value={builderYear}
                onChange={(event) => {
                  setBuilderYear(Number(event.target.value))
                  setBuilderPreview(null)
                }}
              />
            </label>
            <label>
              <span>考期</span>
              <select
                value={builderSession}
                onChange={(event) => {
                  setBuilderSession(event.target.value as Paper['session'])
                  setBuilderPreview(null)
                }}
              >
                <option value="4月">4月</option>
                <option value="10月">10月</option>
                <option value="专项">专项</option>
                <option value="样卷">样卷</option>
              </select>
            </label>
          </div>
          <label className="wide-field">
            <span>试卷名</span>
            <input
              value={builderTitle}
              onChange={(event) => {
                setBuilderTitle(event.target.value)
                setBuilderPreview(null)
              }}
            />
          </label>
          <textarea
            value={pastedText}
            placeholder={'示例：\n一、单项选择题\n1. 鸦片战争前，中国封建文化的核心是（ ） A. 儒家思想 B. 法家思想 C. 道家思想 D. 墨家思想\n2. 马克思主义首要的观点是（ ） A. 政治观点 B. 认识观点 C. 实践观点 D. 发展观点\n参考答案：\n1.A 2.C\n答案及解析：\n1.A 解析：儒家思想长期处于封建正统地位。'}
            onChange={(event) => {
              setPastedText(event.target.value)
              setBuilderPreview(null)
            }}
          />
          <div className="builder-actions">
            <button className="primary" type="button" onClick={buildPaperFromText}>
              <Sparkles size={18} />
              解析预览
            </button>
            <button type="button" onClick={importBuilderPreview} disabled={!builderPreview?.bank.questions.length}>
              <Upload size={18} />
              确认导入
            </button>
            <button type="button" onClick={downloadBuilderPreview} disabled={!builderPreview?.bank.questions.length}>
              <Download size={18} />
              下载预览
            </button>
          </div>
          <small>{builderMessage}</small>
          {builderPreview && previewStats && previewPaper && (
            <section className="builder-preview">
              <div className="builder-preview-head">
                <div>
                  <p className="eyebrow">导入前预览</p>
                  <strong>{previewPaper.title}</strong>
                  <small>{previewPaper.year} · {previewPaper.session} · 题目合计 {previewStats.score} 分</small>
                </div>
                <div className="preview-side">
                  <div className="preview-score-controls">
                    <label>
                      <span>整卷满分</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={previewPaper.totalScore}
                        onChange={(event) => updatePreviewPaperScore(event.target.value)}
                      />
                    </label>
                    <button type="button" onClick={syncPreviewPaperScore} disabled={previewPaper.totalScore === previewStats.score}>
                      按题目合计
                    </button>
                  </div>
                  <div className="preview-metrics">
                    <span>{previewStats.total} 题</span>
                    <span>{previewStats.objective} 客观题</span>
                    <span>{previewStats.text} 主观题</span>
                    <span className={previewStats.missingAnswer ? 'warn' : ''}>{previewStats.missingAnswer} 缺答案</span>
                    <span className={previewStats.missingAnalysis ? 'warn' : ''}>{previewStats.missingAnalysis} 缺解析</span>
                  </div>
                </div>
              </div>

              {builderPreview.warnings.length > 0 && (
                <div className="preview-warnings">
                  {builderPreview.warnings.slice(0, 5).map((warning) => (
                    <span key={warning}>{warning}</span>
                  ))}
                  {builderPreview.warnings.length > 5 && <span>还有 {builderPreview.warnings.length - 5} 条提醒</span>}
                </div>
              )}

              <div className="preview-question-list">
                {builderPreview.bank.questions.map((question, index) => {
                  const needsFix = question.answer.includes('待补充答案') || question.analysis.includes('暂未提供解析')
                  return (
                    <details key={question.id} className="preview-question-editor" open={index < 3 || needsFix}>
                      <summary>
                        <span>{index + 1}</span>
                        <div>
                          <strong>{question.stem}</strong>
                          <small>
                            {questionLabel(question.type)} · {question.points} 分 · 答案 {question.answer.join(' / ')}
                          </small>
                        </div>
                        {needsFix && <em>待校正</em>}
                      </summary>
                      <div className="preview-edit-grid">
                        <label className="point-field">
                          <span>本题分值</span>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={question.points}
                            onChange={(event) => updatePreviewQuestionPoints(question, event.target.value)}
                          />
                        </label>
                        <label>
                          <span>{question.type === 'single' || question.type === 'multiple' ? '答案' : '参考要点'}</span>
                          <textarea
                            value={formatAnswerForEditor(question)}
                            placeholder={question.type === 'single' || question.type === 'multiple' ? '如 A 或 A,B' : '每行一个答题要点'}
                            onChange={(event) => updatePreviewAnswer(question, event.target.value)}
                          />
                        </label>
                        <label>
                          <span>解析</span>
                          <textarea
                            value={question.analysis}
                            placeholder="补充教材考点、易错点或答案解释"
                            onChange={(event) =>
                              updatePreviewQuestion(question.id, {
                                analysis: event.target.value.trim() || '本题来自粘贴导入，暂未提供解析。建议补充教材页码、考点和易错点。',
                              })
                            }
                          />
                        </label>
                      </div>
                    </details>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        <div className="resource-box imported-manager">
          <div>
            <ArchiveIcon />
            <strong>本地导入卷</strong>
          </div>
          <p>这里管理你自己整理进来的历年真题。导出可以当备份，删除只影响浏览器本地数据。</p>
          {importedBank.papers.length ? (
            <div className="imported-paper-list">
              {importedBank.papers
                .slice()
                .sort((a, b) => b.year - a.year || a.title.localeCompare(b.title))
                .map((paper) => {
                  const course = courses.find((item) => item.id === paper.courseId)
                  const paperQuestions = importedQuestionsForPaper(paper)
                  const quality = getPreviewStats({ papers: [paper], questions: paperQuestions })
                  return (
                    <div key={paper.id} className="imported-paper-item">
                      <div>
                        <span>{course?.shortName ?? paper.courseId}</span>
                        <strong>{paper.title}</strong>
                        <small>
                          {paper.year} · {paper.session} · {importedQuestionCount(paper.id)} 题 · {paper.totalScore} 分 · {quality.missingAnswer} 缺答案 ·{' '}
                          {quality.missingAnalysis} 缺解析
                        </small>
                      </div>
                      <div>
                        <button type="button" onClick={() => onOpenPaper(paper)}>
                          <FileQuestion size={16} />
                          开刷
                        </button>
                        <button type="button" onClick={() => loadImportedPaperToPreview(paper)}>
                          <ClipboardList size={16} />
                          校正
                        </button>
                        <button type="button" onClick={() => onExportImportedPaper(paper.id)}>
                          <Download size={16} />
                          导出
                        </button>
                        <button type="button" onClick={() => onDeleteImportedPaper(paper.id)}>
                          <XCircle size={16} />
                          删除
                        </button>
                      </div>
                    </div>
                  )
                })}
            </div>
          ) : (
            <div className="compact-empty">还没有本地导入卷。先用粘贴制卷或 JSON 导入补一套。</div>
          )}
        </div>

        <div className="resource-box source-list">
          <div>
            <LibraryBig size={22} />
            <strong>{selectedCourse.shortName} 资料来源</strong>
          </div>
          {selectedCourse.sources.map((source) => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
              <span>{source.title}</span>
              <small>{source.publisher} · {source.note}</small>
            </a>
          ))}
        </div>

        <div className="resource-box source-list">
          <div>
            <History size={22} />
            <strong>历年真题入口</strong>
          </div>
          {pastPaperSources.map((source) => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
              <span>{source.title}</span>
              <small>{source.publisher} · {source.note}</small>
            </a>
          ))}
        </div>
      </div>

      <div className="import-guide">
        <p className="eyebrow">真题补齐策略</p>
        <p>
          现在应用已经把旧代码 03708/03709 映射到新代码 15043/15044。公开网络上的完整真题多来自第三方资料站，
          版权状态不统一，所以不把不明授权的整套卷硬编码进仓库；你下载或复制到本地后，可以用“粘贴文本制卷”生成本地题库。
        </p>
      </div>
    </section>
  )
}

function ArchiveIcon() {
  return <LibraryBig size={22} />
}

function SettingsView({
  apiKey,
  onApiKeyChange,
  onClear,
}: {
  apiKey: string
  onApiKeyChange: (apiKey: string) => void
  onClear: () => void
}) {
  return (
    <section className="settings-view">
      <div className="section-heading">
        <p className="eyebrow">设置</p>
        <h3>AI 评价与本地数据</h3>
      </div>
      <div className="settings-grid">
        <label className="setting-card">
          <span>
            <KeyRound size={20} />
            DeepSeek API Key
          </span>
          <input
            type="password"
            value={apiKey}
            placeholder="sk-..."
            onChange={(event) => onApiKeyChange(event.target.value)}
          />
          <small>Key 只保存在你的浏览器本地，用于简答题和论述题 AI 评价。</small>
        </label>
        <div className="setting-card">
          <span>
            <RotateCcw size={20} />
            重置本地数据
          </span>
          <p>清空答题记录、导入题库和 API Key。题库种子数据会保留在代码里。</p>
          <button type="button" onClick={onClear}>
            清空本地数据
          </button>
        </div>
      </div>
    </section>
  )
}

export default App
