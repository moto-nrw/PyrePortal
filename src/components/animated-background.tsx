import { useEffect, useRef } from 'react';

/**
 * Static background with colored bubbles (Phoenix style, no animation)
 */
export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const setCanvasSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    // Draw static bubbles (no animation)
    const drawBubbles = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Vibrant colors
      const colors = [
        '#FF8080', // red
        '#80D8FF', // blue
        '#A5D6A7', // green
        '#FFA726', // orange
      ];

      const bubbles = [
        // Top left - Red
        {
          x: canvas.width * 0.2,
          y: canvas.height * 0.2,
          radius: Math.min(canvas.width, canvas.height) * 0.4,
          color: colors[0] ?? '#FF8080',
        },
        // Top right - Blue
        {
          x: canvas.width * 0.8,
          y: canvas.height * 0.2,
          radius: Math.min(canvas.width, canvas.height) * 0.35,
          color: colors[1] ?? '#80D8FF',
        },
        // Bottom left - Green
        {
          x: canvas.width * 0.25,
          y: canvas.height * 0.8,
          radius: Math.min(canvas.width, canvas.height) * 0.38,
          color: colors[2] ?? '#A5D6A7',
        },
        // Bottom right - Orange
        {
          x: canvas.width * 0.8,
          y: canvas.height * 0.85,
          radius: Math.min(canvas.width, canvas.height) * 0.45,
          color: colors[3] ?? '#FFA726',
        },
      ];

      // Apply blur to the whole canvas
      ctx.filter = 'blur(40px)';

      // Draw each bubble
      bubbles.forEach(bubble => {
        const gradient = ctx.createRadialGradient(
          bubble.x,
          bubble.y,
          0,
          bubble.x,
          bubble.y,
          bubble.radius
        );

        gradient.addColorStop(0, bubble.color);
        gradient.addColorStop(1, 'rgba(255,255,255,0)');

        ctx.beginPath();
        ctx.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.globalAlpha = 0.35;
        ctx.fill();
      });

      // Reset filter
      ctx.filter = 'none';
    };

    // Initialize
    setCanvasSize();
    drawBubbles();

    // Redraw on resize
    const handleResize = () => {
      setCanvasSize();
      drawBubbles();
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 h-full w-full" style={{ zIndex: -10 }} />;
}
