import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        registrations.forEach((registration) => registration.unregister())
      })
      .catch(() => {})

    if ('caches' in window) {
      caches
        .keys()
        .then((keys) => {
          keys.filter((key) => key.startsWith('zikao-biguo-')).forEach((key) => caches.delete(key))
        })
        .catch(() => {})
    }
  })
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => registration.update()).catch(() => {
      // PWA registration is best-effort.
    })
  })
}
