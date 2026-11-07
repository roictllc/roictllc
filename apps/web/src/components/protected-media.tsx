'use client';
import type { ReactNode } from 'react';

/**
 * Preview deterrents (spec Product 3): no context menu, no drag, no selection, hidden when printing. These are
 * deterrents only — OS screenshots cannot be blocked; the watermark baked into the pixels is the real protection.
 */
export function ProtectedFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`roi-protected select-none print:hidden ${className ?? ''}`} onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()} onCopy={(e) => e.preventDefault()}>
      {children}
    </div>
  );
}

export function PreviewImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <ProtectedFrame className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} draggable={false} className="pointer-events-none mx-auto block h-auto max-h-full max-w-full rounded-xl object-contain" />
    </ProtectedFrame>
  );
}

export function PreviewVideo({ src, poster }: { src: string; poster?: string }) {
  return (
    <ProtectedFrame>
      <video src={src} poster={poster} controls controlsList="nodownload noplaybackrate" disablePictureInPicture playsInline loop className="mx-auto block w-full rounded-xl" />
    </ProtectedFrame>
  );
}
