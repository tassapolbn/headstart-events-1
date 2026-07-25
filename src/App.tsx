import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { PageLoader } from './components/ui/basics';

import AdminLayout from './pages/admin/AdminLayout';
import LoginPage from './pages/admin/LoginPage';
import DashboardPage from './pages/admin/DashboardPage';
import EventsListPage from './pages/admin/EventsListPage';
import EventEditorPage from './pages/admin/EventEditorPage';
import RegistrationsPage from './pages/admin/RegistrationsPage';
import AnalyticsPage from './pages/admin/AnalyticsPage';
import CheckInPage from './pages/admin/CheckInPage';
import SignsPage from './pages/admin/SignsPage';
import PlanPrintPage from './pages/admin/PlanPrintPage';
import TemplatesPage from './pages/admin/TemplatesPage';
import SettingsPage from './pages/admin/SettingsPage';

import PublicHome from './pages/public/PublicHome';
import EventPage from './pages/public/EventPage';
import SuccessPage from './pages/public/SuccessPage';
import LookupPage from './pages/public/LookupPage';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader label="Checking your session" />;
  if (!session) return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<PublicHome />} />
      <Route path="/e/:slug" element={<EventPage />} />
      <Route path="/e/:slug/success/:reference" element={<SuccessPage />} />
      <Route path="/lookup" element={<LookupPage />} />

      {/* Admin */}
      <Route path="/admin/login" element={<LoginPage />} />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="events" element={<EventsListPage />} />
        <Route path="events/:id" element={<EventEditorPage />} />
        <Route path="events/:id/registrations" element={<RegistrationsPage />} />
        <Route path="events/:id/analytics" element={<AnalyticsPage />} />
        <Route path="events/:id/checkin" element={<CheckInPage />} />
        <Route path="events/:id/signs" element={<SignsPage />} />
        <Route path="events/:id/plan" element={<PlanPrintPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
