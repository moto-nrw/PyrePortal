import { Component, type ErrorInfo, type ReactNode } from 'react';

import { logger, logError } from './logger';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

/**
 * Error Boundary component that uses the logger system
 * to log React component errors
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error using our logging system
    logError(error, 'ErrorBoundary');

    // Log additional component stack info
    logger.error('Component stack trace:', {
      componentStack: errorInfo.componentStack,
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Return fallback UI if provided, otherwise default error message
      return (
        this.props.fallback ?? (
          <div
            style={{
              padding: '20px',
              margin: '20px',
              border: '1px solid #f56565',
              borderRadius: '5px',
              backgroundColor: '#fff5f5',
              color: '#c53030',
            }}
          >
            <h2>Something went wrong</h2>
            <details style={{ whiteSpace: 'pre-wrap', marginTop: '10px' }}>
              <summary>Error details</summary>
              {this.state.error?.toString()}
            </details>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
