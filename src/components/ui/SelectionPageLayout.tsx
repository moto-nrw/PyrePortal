import type { ReactNode } from 'react';

import { BackgroundWrapper } from '../background-wrapper';

import BackButton from './BackButton';
import { LoadingSpinner, SpinKeyframes } from './LoadingSpinner';

interface SelectionPageLayoutProps {
  /** Page title */
  readonly title: string;
  /** Back button handler */
  readonly onBack: () => void;
  /** Whether data is loading */
  readonly isLoading: boolean;
  /** Error message to display */
  readonly error?: string | null;
  /** Page content when not loading */
  readonly children: ReactNode;
  /** Spinner color (default: blue) */
  readonly spinnerColor?: string;
  /** Optional content to show between title and main content (e.g., filters) */
  readonly headerContent?: ReactNode;
}

/**
 * Shared layout for selection pages.
 * Provides consistent structure with back button, title, loading state, and error display.
 */
export function SelectionPageLayout({
  title,
  onBack,
  isLoading,
  error,
  children,
  spinnerColor = '#5080D8',
  headerContent,
}: SelectionPageLayoutProps) {
  return (
    <BackgroundWrapper>
      <div
        style={{
          width: '100vw',
          height: '100vh',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Back button */}
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            zIndex: 10,
          }}
        >
          <BackButton onClick={onBack} />
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: '56px',
            fontWeight: 700,
            marginTop: '40px',
            marginBottom: '20px',
            textAlign: 'center',
            color: '#111827',
          }}
        >
          {title}
        </h1>

        {/* Error display */}
        {error && (
          <div
            style={{
              backgroundColor: '#FEE2E2',
              color: '#DC2626',
              padding: '16px',
              borderRadius: '8px',
              marginBottom: '16px',
              textAlign: 'center',
              fontSize: '16px',
            }}
          >
            {error}
          </div>
        )}

        {/* Optional header content (e.g., filters) - shown even during loading */}
        {headerContent}

        {/* Loading or content */}
        {isLoading ? <LoadingSpinner color={spinnerColor} /> : children}

        <SpinKeyframes />
      </div>
    </BackgroundWrapper>
  );
}
