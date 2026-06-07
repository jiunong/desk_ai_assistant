import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import LlmSettings from './pages/LlmSettings'
import PetSettings from './pages/PetSettings'
import HistoryPage from './pages/HistoryPage'
import McpSettings from './pages/McpSettings'
import './styles.css'

const routerBasename = import.meta.env.DEV ? '/config' : '/'
function Layout() {
  return (
    <div className="config-layout">
      <aside>
        <h1>Desk AI</h1>
        <nav>
          <NavLink to="/" end>大模型</NavLink>
          <NavLink to="/pet">宠物</NavLink>
          <NavLink to="/history">历史记忆</NavLink>
          <NavLink to="/mcp">MCP / Skill</NavLink>
        </nav>
      </aside>
      <main>
        <Routes>
          <Route path="/" element={<LlmSettings />} />
          <Route path="/pet" element={<PetSettings />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/mcp" element={<McpSettings />} />
        </Routes>
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={routerBasename}>
      <Layout />
    </BrowserRouter>
  </StrictMode>
)