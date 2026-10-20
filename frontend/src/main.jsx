import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App.jsx'
// Self-hosted rather than loaded from Google Fonts: a third-party stylesheet
// blocks first paint on a network we do not control, and sends every visitor's
// IP address to Google.
//
// Static instances of exactly the cuts the design uses, latin only. The
// variable builds carry every weight and axis and cost several times more for
// the handful of weights actually set. Inter is the face for everything;
// JetBrains Mono sets the uppercase labels, dates and counts; Source Serif 4
// sets only the two page-opening headlines (Home and About), with an italic
// for the accent phrase.
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
// Markdown bold compiles to <strong>, which defaults to 700; without this the
// browser would quietly fall back to the 600 cut.
import '@fontsource/inter/latin-700.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/source-serif-4/latin-500.css'
import '@fontsource/source-serif-4/latin-500-italic.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
