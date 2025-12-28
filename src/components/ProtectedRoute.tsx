import { Navigate } from 'react-router-dom';

import { useUserStore } from '../store/userStore';

interface ProtectedRouteProps {
  readonly children: React.ReactNode;
  /** Additional condition that must be true (beyond authentication) */
  readonly condition?: boolean;
  /** Where to redirect if condition fails (defaults to '/home' if authenticated, '/' otherwise) */
  readonly fallbackPath?: string;
}

/**
 * Route guard component that protects routes requiring authentication.
 *
 * Usage:
 * - Basic protection: <ProtectedRoute><MyPage /></ProtectedRoute>
 * - With extra condition: <ProtectedRoute condition={hasActiveSession}><ScanningPage /></ProtectedRoute>
 * - With custom fallback: <ProtectedRoute condition={hasRoom} fallbackPath="/rooms"><CreatePage /></ProtectedRoute>
 */
function ProtectedRoute({ children, condition = true, fallbackPath }: ProtectedRouteProps) {
  const { authenticatedUser } = useUserStore();
  const isAuthenticated = !!authenticatedUser;

  // Not authenticated - redirect to landing
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // Authenticated but condition not met - redirect to fallback
  if (!condition) {
    const redirectTo = fallbackPath ?? '/home';
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}

export default ProtectedRoute;
