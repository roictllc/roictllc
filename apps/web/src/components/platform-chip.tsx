const META = {
  INSTAGRAM: { label: 'Instagram', bg: 'linear-gradient(135deg,#FFC400,#FF2D95 55%,#7B3FFF)', glyph: '◎' },
  TIKTOK: { label: 'TikTok', bg: 'linear-gradient(135deg,#00E5FF,#FF2D95)', glyph: '♪' },
  FACEBOOK: { label: 'Facebook', bg: 'linear-gradient(135deg,#2D7BFF,#1A4FCC)', glyph: 'f' },
  X: { label: 'X', bg: 'linear-gradient(135deg,#2A2F45,#04050D)', glyph: '𝕏' },
} as const;

/** Generic platform chip (not the platforms' trademarked logos). */
export function PlatformChip({ platform }: { platform: keyof typeof META }) {
  const m = META[platform];
  return (
    <span className="flex items-center gap-3">
      <span aria-hidden className="grid size-9 place-items-center rounded-xl text-base font-bold text-white" style={{ background: m.bg }}>{m.glyph}</span>
      <span className="font-medium">{m.label}</span>
    </span>
  );
}
