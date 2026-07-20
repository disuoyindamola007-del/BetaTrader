// TEMP DEBUG: show uncaught errors on screen instead of blank page
window.addEventListener('error', (e) => {
  document.body.innerHTML = '<pre style="color:red;padding:20px;white-space:pre-wrap;font-size:14px;">ERROR: ' + e.message + '\n\nFILE: ' + e.filename + ':' + e.lineno + '\n\nSTACK:\n' + (e.error && e.error.stack ? e.error.stack : 'no stack') + '</pre>';
});
window.addEventListener('unhandledrejection', (e) => {
  document.body.innerHTML = '<pre style="color:orange;padding:20px;white-space:pre-wrap;font-size:14px;">UNHANDLED PROMISE REJECTION:\n' + (e.reason && e.reason.stack ? e.reason.stack : e.reason) + '</pre>';
});

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)