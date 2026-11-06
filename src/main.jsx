import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import './index.css'
import App from './App.jsx'
import UpdateNotice from './components/UpdateNotice.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <UpdateNotice />
  </StrictMode>,
)
