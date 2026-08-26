import type { LucideIcon } from "lucide-react";
import type { CSSProperties, PointerEvent } from "react";

type GlassButtonProps = {
  label: string;
  icon: LucideIcon;
  tone?: "glass" | "black" | "white";
};

type GlassButtonStyle = CSSProperties & {
  "--glass-angle": string;
};

function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - (bounds.left + bounds.width / 2);
  const y = event.clientY - (bounds.top + bounds.height / 2);
  const angle = Math.atan2(y, x) + Math.PI / 2;

  event.currentTarget.style.setProperty("--glass-angle", `${angle}rad`);
}

export default function GlassButton({ label, icon: Icon, tone = "glass" }: GlassButtonProps) {
  return (
    <button
      type="button"
      className="sylva-glass-button"
      data-tone={tone}
      style={{ "--glass-angle": "2.4rad" } as GlassButtonStyle}
      onPointerMove={handlePointerMove}
    >
      <span className="sylva-glass-button__plate" aria-hidden="true" />
      <span className="sylva-glass-button__content">
        <Icon aria-hidden="true" />
        <span>{label}</span>
      </span>
    </button>
  );
}
