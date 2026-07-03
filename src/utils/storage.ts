import type { AppState, ImportedBank, Paper, Question } from '../types'

const STATE_KEY = 'zikao-biguo-state-v1'
const IMPORT_KEY = 'zikao-biguo-imports-v1'

export function loadState(defaultState: AppState) {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    return raw ? ({ ...defaultState, ...JSON.parse(raw) } as AppState) : defaultState
  } catch {
    return defaultState
  }
}

export function saveState(state: AppState) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state))
}

export function loadImports(): ImportedBank {
  try {
    const raw = localStorage.getItem(IMPORT_KEY)
    return raw ? (JSON.parse(raw) as ImportedBank) : { papers: [], questions: [] }
  } catch {
    return { papers: [], questions: [] }
  }
}

export function saveImports(papers: Paper[], questions: Question[]) {
  localStorage.setItem(IMPORT_KEY, JSON.stringify({ papers, questions }))
}

export function clearAllStorage() {
  localStorage.removeItem(STATE_KEY)
  localStorage.removeItem(IMPORT_KEY)
}
