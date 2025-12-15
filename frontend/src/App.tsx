import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import AppShell from "./layout/AppShell";
import RequireAuth from "./components/RequireAuth";
import HomePage from "./pages/HomePage";
import AgentsPage from "./pages/AgentsPage";
import TokensPage from "./pages/TokensPage";
import RunsInsightsPage from "./pages/RunsInsightsPage";
import SettingsPage from "./pages/SettingsPage";
import DocsPage from "./pages/DocsPage";
import LoginPage from "./pages/LoginPage";
import WorkflowsPage from "./pages/WorkflowsPage";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route path="/" element={<HomePage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/logs" element={<RunsInsightsPage />} />
          <Route path="/tokens" element={<TokensPage />} />
          <Route path="/insights" element={<Navigate to="/logs" replace />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/workflows" element={<WorkflowsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
