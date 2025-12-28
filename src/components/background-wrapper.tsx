import { AnimatedBackground } from './animated-background';

interface BackgroundWrapperProps {
  readonly children: React.ReactNode;
}

export function BackgroundWrapper({ children }: BackgroundWrapperProps) {
  return (
    <>
      {/* Background elements (positioned at the back) */}
      <AnimatedBackground />

      {/* Content (positioned on top) */}
      <div className="relative min-h-screen">{children}</div>
    </>
  );
}
