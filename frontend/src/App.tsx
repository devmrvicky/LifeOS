import { HashRouter, Routes, Route } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import HomePage from './pages/Home';
import CapturePage from './pages/Capture';
import TasksPage from './pages/Tasks';
import TaskDetailPage from './pages/TaskDetail';
import SettingsPage from './pages/Settings';

function App() {
  return (
    <HashRouter>
      <div className="min-h-screen bg-paper">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/capture" element={<CapturePage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/:id" element={<TaskDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
        <BottomNav />
      </div>
    </HashRouter>
  );
}

export default App;
