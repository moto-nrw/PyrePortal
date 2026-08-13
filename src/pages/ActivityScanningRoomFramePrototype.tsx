// PROTOTYPE ONLY — three room-frame treatments, switchable via ?variant=.
// Question: which broad frame stays obvious from a child's viewing distance
// without recolouring the neutral check-in content or semantic scan modals?
import { useSearchParams } from 'react-router';

import {
  PrototypeSwitcher,
  type PrototypeVariant,
} from '../components/prototype/PrototypeSwitcher';
import { designSystem } from '../styles/designSystem';

const variants: PrototypeVariant[] = [
  { key: 'A', name: 'Außenrahmen' },
  { key: 'B', name: 'Eingelassene Fläche' },
  { key: 'C', name: 'Rahmen mit Eckmarken' },
];

const colors = {
  light: { value: '#F4D35E', label: 'Hell · Gelb' },
  dark: { value: '#2457A6', label: 'Dunkel · Blau' },
  none: { value: designSystem.gray[300], label: 'Fallback · Neutral' },
} as const;

type ColorKey = keyof typeof colors;

export default function ActivityScanningRoomFramePrototype() {
  const [searchParams, setSearchParams] = useSearchParams();
  const variant = variants.some(item => item.key === searchParams.get('variant'))
    ? searchParams.get('variant')!
    : 'A';
  const requestedColor = searchParams.get('color');
  const colorKey: ColorKey =
    requestedColor === 'dark' || requestedColor === 'none' ? requestedColor : 'light';
  const roomColor = colors[colorKey].value;

  const chooseColor = (nextColor: ColorKey) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('color', nextColor);
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#FFFFFF' }}>
      {variant === 'A' && <OuterFrame roomColor={roomColor} neutral={colorKey === 'none'} />}
      {variant === 'B' && <InsetField roomColor={roomColor} neutral={colorKey === 'none'} />}
      {variant === 'C' && <CornerFrame roomColor={roomColor} neutral={colorKey === 'none'} />}

      <div
        style={{
          position: 'fixed',
          top: '18px',
          right: '18px',
          zIndex: 2000,
          display: 'flex',
          gap: '8px',
          padding: '8px',
          borderRadius: '14px',
          background: 'rgba(255,255,255,0.96)',
          boxShadow: designSystem.shadows.md,
        }}
      >
        {(Object.keys(colors) as ColorKey[]).map(key => (
          <button
            key={key}
            type="button"
            onClick={() => chooseColor(key)}
            aria-pressed={colorKey === key}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: colorKey === key ? '3px solid #111827' : '1px solid #D1D5DB',
              background: '#FFFFFF',
              color: '#111827',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: '14px',
                height: '14px',
                marginRight: '7px',
                borderRadius: '50%',
                background: colors[key].value,
                border: '1px solid rgba(0,0,0,0.15)',
                verticalAlign: '-2px',
              }}
            />
            {colors[key].label}
          </button>
        ))}
      </div>

      <PrototypeSwitcher variants={variants} current={variant} />
    </div>
  );
}

function ScreenContent({ neutral }: { neutral: boolean }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: designSystem.colors.white,
        color: designSystem.gray[900],
        position: 'relative',
      }}
    >
      <button type="button" aria-label="Abholzeit abfragen" style={roundButtonStyle}>
        ◷
      </button>
      <button
        type="button"
        style={{ ...roundButtonStyle, left: 'auto', right: '28px', fontSize: '24px' }}
      >
        ♙
      </button>
      <div style={{ marginTop: '68px' }}>
        <h1 style={{ margin: 0, fontSize: '56px', lineHeight: 1.2 }}>Nachmittagsbetreuung</h1>
        <p style={{ margin: 0, color: designSystem.gray[500], fontSize: '32px', fontWeight: 500 }}>
          Kreativraum
        </p>
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          fontSize: '220px',
          lineHeight: 1,
          fontWeight: 800,
          color: designSystem.pastel.green.accent,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        17
      </div>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: '78px',
          padding: '7px 12px',
          borderRadius: '9999px',
          background: neutral ? designSystem.gray[100] : '#FFFFFF',
          color: designSystem.gray[600],
          transform: 'translateX(-50%)',
          fontSize: '14px',
          fontWeight: 700,
        }}
      >
        PROTOTYP · Ansicht aus einigen Metern Entfernung prüfen
      </div>
    </div>
  );
}

function OuterFrame({ roomColor, neutral }: FrameProps) {
  return (
    <div style={{ width: '100%', height: '100%', padding: '34px', background: roomColor }}>
      <ScreenContent neutral={neutral} />
    </div>
  );
}

function InsetField({ roomColor, neutral }: FrameProps) {
  return (
    <div style={{ width: '100%', height: '100%', padding: '22px', background: roomColor }}>
      <div
        style={{
          width: '100%',
          height: '100%',
          padding: '18px',
          borderRadius: '34px',
          background: 'rgba(255,255,255,0.38)',
        }}
      >
        <div style={{ width: '100%', height: '100%', overflow: 'hidden', borderRadius: '20px' }}>
          <ScreenContent neutral={neutral} />
        </div>
      </div>
    </div>
  );
}

function CornerFrame({ roomColor, neutral }: FrameProps) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: '24px',
        background: roomColor,
        clipPath:
          'polygon(0 0, 34% 0, 34% 14px, 66% 14px, 66% 0, 100% 0, 100% 100%, 66% 100%, 66% calc(100% - 14px), 34% calc(100% - 14px), 34% 100%, 0 100%)',
      }}
    >
      <div style={{ width: '100%', height: '100%', boxShadow: '0 0 0 10px #FFFFFF' }}>
        <ScreenContent neutral={neutral} />
      </div>
    </div>
  );
}

interface FrameProps {
  roomColor: string;
  neutral: boolean;
}

const roundButtonStyle = {
  position: 'absolute',
  top: '28px',
  left: '28px',
  width: '76px',
  height: '76px',
  border: 'none',
  borderRadius: '50%',
  background: designSystem.gray[900],
  color: '#FFFFFF',
  fontSize: '38px',
  fontWeight: 700,
} as const;
