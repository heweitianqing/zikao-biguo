import {
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  FileQuestion,
  History,
  Import,
  KeyRound,
  LibraryBig,
  RotateCcw,
  Settings,
  Sparkles,
  Upload,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import './App.css'
import { courses, importTemplate, papers as seedPapers, pastPaperSources, questions as seedQuestions } from './data/questionBank'
import type { AnswerRecord, AppState, ImportedBank, Paper, Question } from './types'
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

function App() {
  const [state, setState] = useState<AppState>(() => loadState(defaultState))
  const [imports, setImports] = useState<ImportedBank>(() => loadImports())
  const [aiReview, setAiReview] = useState<AiReview | null>(null)
  const [notice, setNotice] = useState('已按上海电机学院 2025 计划初始化题库。')

  const allPapers = useMemo(() => [...seedPapers, ...imports.papers], [imports.papers])
  const allQuestions = useMemo(() => [...seedQuestions, ...imports.questions], [imports.questions])

  const selectedCourse = courses.find((course) => course.id === state.selectedCourseId) ?? courses[0]
  const coursePapers = allPapers
    .filter((paper) => paper.courseId === selectedCourse.id)
    .sort((a, b) => b.year - a.year || a.title.localeCompare(b.title))
  const selectedPaper =
    allPapers.find((paper) => paper.id === state.selectedPaperId && paper.courseId === selectedCourse.id) ??
    coursePapers[0] ??
    allPapers[0]
  const paperQuestions = selectedPaper.questionIds
    .map((id) => allQuestions.find((question) => question.id === id))
    .filter((question): question is Question => Boolean(question))
  const currentQuestion = paperQuestions[state.selectedQuestionIndex] ?? paperQuestions[0]
  const currentAttempt = state.attempts[selectedPaper.id] ?? createAttempt(selectedPaper)
  const currentRecord = currentQuestion ? currentAttempt.answers[currentQuestion.id] : undefined
  const answeredCount = selectedPaper.questionIds.filter((id) => currentAttempt.answers[id]?.checked).length
  const score = calculatePaperScore(selectedPaper, paperQuestions, currentAttempt.answers)
  const progress = paperQuestions.length ? Math.round((answeredCount / paperQuestions.length) * 100) : 0
  const mistakeQuestions = allQuestions.filter((question) => {
    const attempt = Object.values(state.attempts).find((item) => item.answers[question.id])
    const record = attempt?.answers[question.id]
    return record?.checked && getQuestionScore(question, record) < question.points
  })

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
    const firstPaper = allPapers.find((paper) => paper.courseId === courseId)
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
      setNotice(`${paper.title} 还没有导入题目。可以在资源页用 JSON 真题包导入。`)
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
      const nextRecord: AnswerRecord = {
        questionId: question.id,
        answer: nextAnswer,
        textAnswer: existing?.textAnswer ?? '',
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
    const blob = new Blob([JSON.stringify(importTemplate, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'zikao-import-template.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  function clearData() {
    clearAllStorage()
    setState(defaultState)
    setImports({ papers: [], questions: [] })
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
            const paperCount = allPapers.filter((paper) => paper.courseId === course.id).length
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
                        return (
                          <button
                            key={letter}
                            className={chosen ? 'chosen' : ''}
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
                    <button className="primary" type="button" onClick={() => checkQuestion(currentQuestion)}>
                      <CheckCircle2 size={18} />
                      判题
                    </button>
                    {(currentQuestion.type === 'short' || currentQuestion.type === 'essay') && (
                      <button type="button" onClick={() => reviewWithAi(currentQuestion)}>
                        <BrainCircuit size={18} />
                        AI 评价
                      </button>
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

        {state.view === 'papers' && <PapersView papers={coursePapers} selectedPaperId={selectedPaper.id} onSelect={selectPaper} />}

        {state.view === 'mistakes' && (
          <MistakesView
            questions={mistakeQuestions}
            onOpen={(question) => {
              const paper = allPapers.find((item) => item.id === question.paperId)
              if (!paper) return
              patchState({
                selectedCourseId: question.courseId,
                selectedPaperId: question.paperId,
                selectedQuestionIndex: Math.max(paper.questionIds.indexOf(question.id), 0),
                view: 'practice',
              })
            }}
          />
        )}

        {state.view === 'resources' && (
          <ResourcesView
            selectedCourse={selectedCourse}
            importedCount={imports.questions.length}
            onImport={handleImport}
            onImportBank={(bank, messagePrefix) => importBank(bank, messagePrefix)}
            onDownloadTemplate={downloadImportTemplate}
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
  selectedPaperId,
  onSelect,
}: {
  papers: Paper[]
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
        {papers.map((paper) => (
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
            </span>
            <em className={paper.status === 'ready' ? 'ready' : ''}>
              {paper.status === 'ready' ? `${paper.questionIds.length} 题可刷` : '待导入'}
            </em>
          </button>
        ))}
      </div>
    </section>
  )
}

function MistakesView({ questions, onOpen }: { questions: Question[]; onOpen: (question: Question) => void }) {
  return (
    <section className="library-view">
      <div className="section-heading">
        <p className="eyebrow">错题本</p>
        <h3>{questions.length ? `${questions.length} 道题需要复盘` : '目前没有错题'}</h3>
      </div>
      <div className="mistake-list">
        {questions.map((question) => (
          <button key={question.id} type="button" onClick={() => onOpen(question)}>
            <span>{questionLabel(question.type)}</span>
            <strong>{question.stem}</strong>
            <small>{question.tags.join(' / ')}</small>
          </button>
        ))}
      </div>
      {!questions.length && (
        <div className="empty-state">
          <CheckCircle2 size={32} />
          <p>先刷一套卷，判题后这里会自动收集需要复盘的题。</p>
        </div>
      )}
    </section>
  )
}

function ResourcesView({
  selectedCourse,
  importedCount,
  onImport,
  onImportBank,
  onDownloadTemplate,
}: {
  selectedCourse: (typeof courses)[number]
  importedCount: number
  onImport: (file: File) => void
  onImportBank: (bank: ImportedBank, messagePrefix?: string) => void
  onDownloadTemplate: () => void
}) {
  const [builderCourseId, setBuilderCourseId] = useState(selectedCourse.id)
  const [builderYear, setBuilderYear] = useState(new Date().getFullYear())
  const [builderSession, setBuilderSession] = useState<Paper['session']>('4月')
  const [builderTitle, setBuilderTitle] = useState(`${selectedCourse.code} ${new Date().getFullYear()} 年4月真题导入卷`)
  const [pastedText, setPastedText] = useState('')
  const [builderMessage, setBuilderMessage] = useState('支持常见格式：题号开头、A/B/C/D 选项、答案、解析。')

  function buildPaperFromText() {
    const course = courses.find((item) => item.id === builderCourseId) ?? selectedCourse
    const result = parsePastedPaperText(pastedText, course, {
      courseId: course.id,
      title: builderTitle,
      year: builderYear,
      session: builderSession,
    })

    if (!result.bank.questions.length) {
      setBuilderMessage(result.warnings.join('；') || '没有识别到题目。')
      return
    }

    onImportBank(result.bank, '已从粘贴文本生成')
    setBuilderMessage(
      `识别到 ${result.bank.questions.length} 道题。${result.warnings.length ? `提醒：${result.warnings.join('；')}` : '已生成可刷试卷。'}`,
    )
  }

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
          <small>已导入 {importedCount} 道本地题。</small>
        </div>

        <div className="resource-box paste-builder">
          <div>
            <ClipboardList size={22} />
            <strong>粘贴文本制卷</strong>
          </div>
          <p>从网页、PDF OCR 或 Word 里复制题目，按“题号 + 选项 + 答案 + 解析”粘贴，系统会拆成可刷试卷。</p>
          <div className="builder-fields">
            <label>
              <span>科目</span>
              <select
                value={builderCourseId}
                onChange={(event) => {
                  const nextCourse = courses.find((course) => course.id === event.target.value) ?? selectedCourse
                  setBuilderCourseId(nextCourse.id)
                  setBuilderTitle(`${nextCourse.code} ${builderYear} 年${builderSession}真题导入卷`)
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
              <input type="number" value={builderYear} onChange={(event) => setBuilderYear(Number(event.target.value))} />
            </label>
            <label>
              <span>考期</span>
              <select value={builderSession} onChange={(event) => setBuilderSession(event.target.value as Paper['session'])}>
                <option value="4月">4月</option>
                <option value="10月">10月</option>
                <option value="专项">专项</option>
                <option value="样卷">样卷</option>
              </select>
            </label>
          </div>
          <label className="wide-field">
            <span>试卷名</span>
            <input value={builderTitle} onChange={(event) => setBuilderTitle(event.target.value)} />
          </label>
          <textarea
            value={pastedText}
            placeholder={'示例：\n1. 鸦片战争前，中国封建文化的核心是（ ）\nA. 儒家思想\nB. 法家思想\nC. 道家思想\nD. 墨家思想\n答案：A\n解析：儒家思想长期处于封建正统地位。'}
            onChange={(event) => setPastedText(event.target.value)}
          />
          <button className="primary" type="button" onClick={buildPaperFromText}>
            <Sparkles size={18} />
            生成可刷试卷
          </button>
          <small>{builderMessage}</small>
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
          现在应用已经把旧代码 `03708/03709` 映射到新代码 `15043/15044`。公开网络上的完整真题多来自第三方资料站，
          版权状态不统一，所以不把不明授权的整套卷硬编码进仓库；你下载或复制到本地后，可以用“粘贴文本制卷”生成本地题库。
        </p>
      </div>
    </section>
  )
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
