import { useEffect, useRef } from 'react';

interface Props {
  onMovement: (forward: number, right: number) => void;
  onLook: (dx: number, dy: number) => void;
}

export function TouchControls({ onMovement, onLook }: Props) {
  const leftOriginRef = useRef<{ x: number; y: number; id: number } | null>(null);
  const rightOriginRef = useRef<{ x: number; y: number; id: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const leftJoyRef = useRef<HTMLDivElement>(null);
  const rightAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const W = window.innerWidth;

    const onTouchStart = (e: TouchEvent) => {
      for (const touch of Array.from(e.changedTouches)) {
        if (touch.clientX < W / 2 && !leftOriginRef.current) {
          leftOriginRef.current = { x: touch.clientX, y: touch.clientY, id: touch.identifier };
        } else if (touch.clientX >= W / 2 && !rightOriginRef.current) {
          rightOriginRef.current = { x: touch.clientX, y: touch.clientY, id: touch.identifier };
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      for (const touch of Array.from(e.changedTouches)) {
        if (leftOriginRef.current && touch.identifier === leftOriginRef.current.id) {
          const dx = (touch.clientX - leftOriginRef.current.x) / 80;
          const dy = -(touch.clientY - leftOriginRef.current.y) / 80;
          onMovement(Math.max(-1, Math.min(1, dy)), Math.max(-1, Math.min(1, dx)));
          if (leftJoyRef.current) {
            const clampX = Math.max(-40, Math.min(40, touch.clientX - leftOriginRef.current.x));
            const clampY = Math.max(-40, Math.min(40, touch.clientY - leftOriginRef.current.y));
            leftJoyRef.current.style.transform = `translate(${clampX}px, ${clampY}px)`;
          }
        }
        if (rightOriginRef.current && touch.identifier === rightOriginRef.current.id) {
          const dx = (touch.clientX - rightOriginRef.current.x) * 0.003;
          const dy = (touch.clientY - rightOriginRef.current.y) * 0.003;
          onLook(dx, dy);
          rightOriginRef.current = { x: touch.clientX, y: touch.clientY, id: touch.identifier };
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      for (const touch of Array.from(e.changedTouches)) {
        if (leftOriginRef.current?.id === touch.identifier) {
          leftOriginRef.current = null;
          onMovement(0, 0);
          if (leftJoyRef.current) leftJoyRef.current.style.transform = 'translate(0,0)';
        }
        if (rightOriginRef.current?.id === touch.identifier) {
          rightOriginRef.current = null;
        }
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [onMovement, onLook]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      {/* Left joystick */}
      <div className="absolute bottom-16 left-16 w-24 h-24 rounded-full border-2 border-white/20 bg-white/5 pointer-events-auto flex items-center justify-center">
        <div
          ref={leftJoyRef}
          className="w-10 h-10 rounded-full bg-white/30 border border-white/50 transition-none"
        />
      </div>
      {/* Right area label */}
      <div ref={rightAreaRef} className="absolute top-1/2 right-8 -translate-y-1/2 text-white/20 text-sm pointer-events-none select-none">
        Swipe to look
      </div>
    </div>
  );
}
