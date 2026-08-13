// PROTOTYPE ONLY — remove from main after the room-frame decision is captured.
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

export interface PrototypeVariant {
  key: string;
  name: string;
}

export function PrototypeSwitcher({
  variants,
  current,
}: {
  variants: PrototypeVariant[];
  current: string;
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const cycle = (offset: number) => {
    const currentIndex = Math.max(
      0,
      variants.findIndex(variant => variant.key === current)
    );
    const next = variants[(currentIndex + offset + variants.length) % variants.length];
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('variant', next.key);
    void navigate({ search: nextParams.toString() }, { replace: true });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, [contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft') cycle(-1);
      if (event.key === 'ArrowRight') cycle(1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  if (import.meta.env.PROD) return null;

  const selected = variants.find(variant => variant.key === current) ?? variants[0];

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '22px',
        left: '50%',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 12px',
        borderRadius: '9999px',
        background: '#111827',
        color: '#FFFFFF',
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        transform: 'translateX(-50%)',
        fontSize: '15px',
        fontWeight: 700,
      }}
      aria-label="Prototyp-Varianten"
    >
      <button
        type="button"
        onClick={() => cycle(-1)}
        style={arrowStyle}
        aria-label="Vorherige Variante"
      >
        ←
      </button>
      <span style={{ minWidth: '210px' }}>
        {selected.key} — {selected.name}
      </span>
      <button
        type="button"
        onClick={() => cycle(1)}
        style={arrowStyle}
        aria-label="Nächste Variante"
      >
        →
      </button>
    </div>
  );
}

const arrowStyle = {
  width: '38px',
  height: '38px',
  border: '1px solid #4B5563',
  borderRadius: '9999px',
  background: '#1F2937',
  color: '#FFFFFF',
  cursor: 'pointer',
  fontSize: '20px',
} as const;
