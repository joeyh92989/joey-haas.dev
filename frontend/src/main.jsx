import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App.jsx'
// Self-hosted rather than loaded from Google Fonts: a third-party stylesheet
// blocks first paint on a network we do not control, and sends every visitor's
// IP address to Google.
//
// Static instances of exactly the six faces the design uses, latin only. The
// variable builds are the obvious alternative but cost far more here: carrying
// Newsreader's optical-size axis runs to 279kB for latin alone, against roughly
// 70kB for the three cuts actually needed. Optical sizing is the price paid.
import '@fontsource/newsreader/latin-500.css'
import '@fontsource/newsreader/latin-600.css'
import '@fontsource/newsreader/latin-400-italic.css'
import '@fontsource/public-sans/latin-400.css'
import '@fontsource/public-sans/latin-500.css'
import '@fontsource/public-sans/latin-600.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
