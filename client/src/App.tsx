import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sales from './pages/Sales';
import Consultants from './pages/Consultants';
import Settings from './pages/Settings';
import Ranking from './pages/Ranking';

function Guard({ children, admin = false }: { children: JSX.Element; admin?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center text-muted">Carregando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <Guard>
            <Layout />
          </Guard>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="vendas" element={<Sales />} />
        <Route path="ranking" element={<Ranking />} />
        <Route
          path="consultores"
          element={
            <Guard admin>
              <Consultants />
            </Guard>
          }
        />
        <Route
          path="configuracoes"
          element={
            <Guard admin>
              <Settings />
            </Guard>
          }
        />
      </Route>
    </Routes>
  );
}
