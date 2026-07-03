export type QuestionType = 'single' | 'multiple' | 'short' | 'essay'

export type SourceKind = 'official-outline' | 'outline-sample' | 'mock' | 'imported' | 'index'

export type Course = {
  id: string
  code: string
  legacyCodes?: string[]
  name: string
  shortName: string
  credits: number
  examMinutes: number
  passScore: number
  category: '公共基础课' | '专业核心课' | '推荐选考课'
  note: string
  color: string
  sources: ResourceLink[]
  outline: OutlineChapter[]
}

export type OutlineChapter = {
  id: string
  title: string
  focus: string[]
}

export type ResourceLink = {
  title: string
  url: string
  publisher: string
  note: string
}

export type Question = {
  id: string
  courseId: string
  paperId: string
  type: QuestionType
  chapterId: string
  stem: string
  options?: string[]
  answer: string[]
  analysis: string
  points: number
  difficulty: '易' | '较易' | '较难' | '难'
  sourceKind: SourceKind
  tags: string[]
  rubric?: string[]
}

export type Paper = {
  id: string
  courseId: string
  title: string
  year: number
  session: '4月' | '10月' | '样卷' | '专项'
  sourceKind: SourceKind
  status: 'ready' | 'needs-import'
  description: string
  minutes: number
  totalScore: number
  questionIds: string[]
}

export type AnswerRecord = {
  questionId: string
  answer: string[]
  textAnswer: string
  checked: boolean
  earned: number
  updatedAt: string
}

export type PaperAttempt = {
  paperId: string
  currentIndex: number
  answers: Record<string, AnswerRecord>
  startedAt: string
  submittedAt?: string
}

export type AppState = {
  selectedCourseId: string
  selectedPaperId: string
  selectedQuestionIndex: number
  view: 'practice' | 'papers' | 'mistakes' | 'resources' | 'settings'
  attempts: Record<string, PaperAttempt>
  deepseekApiKey: string
}

export type ImportedBank = {
  papers: Paper[]
  questions: Question[]
}
