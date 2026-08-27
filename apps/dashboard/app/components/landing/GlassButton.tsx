import type { LucideIcon } from "lucide-react";
import type { CSSProperties, PointerEvent } from "react";
import { Link } from "react-router";

type GlassButtonProps = {
  fullWidth?: boolean;
  href?: string;
  label: string;
  icon: LucideIcon;
  size?: "default" | "large";
  tone?: "glass" | "black" | "white";
  to?: string;
};

type GlassButtonStyle = CSSProperties & {
  "--glass-angle": string;
};

function handlePointerMove(event: PointerEvent<HTMLElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - (bounds.left + bounds.width / 2);
  const y = event.clientY - (bounds.top + bounds.height / 2);
  const angle = Math.atan2(y, x) + Math.PI / 2;

  event.currentTarget.style.setProperty("--glass-angle", `${angle}rad`);
}

export default function GlassButton({
  fullWidth = false,
  href,
  label,
  icon: Icon,
  size = "default",
  tone = "glass",
  to,
}: GlassButtonProps) {
  const content = (
    <>
      <span className="sylva-glass-button__plate" aria-hidden="true" />
      <span className="sylva-glass-button__content">
        <Icon aria-hidden="true" />
        <span>{label}</span>
      </span>
    </>
  );

  const sharedProps = {
    className: "sylva-glass-button",
    "data-full-width": fullWidth ? "true" : undefined,
    "data-size": size,
    "data-tone": tone,
    onPointerMove: handlePointerMove,
    style: { "--glass-angle": "2.4rad" } as GlassButtonStyle,
  };

  if (href) {
    return (
      <a href={href} {...sharedProps}>
        {content}
      </a>
    );
  }

  if (to) {
    return (
      <Link to={to} {...sharedProps}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" {...sharedProps}>
      {content}
    </button>
  );
}
