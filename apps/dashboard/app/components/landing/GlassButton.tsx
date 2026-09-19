import type { LucideIcon } from "lucide-react";
import type { CSSProperties, MouseEventHandler, PointerEvent } from "react";
import { Link } from "react-router";

type GlassButtonProps = {
  disabled?: boolean;
  fullWidth?: boolean;
  href?: string;
  label: string;
  icon: LucideIcon;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  size?: "default" | "large";
  tone?: "glass" | "black" | "white";
  to?: string;
  type?: "button" | "submit";
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
  disabled = false,
  fullWidth = false,
  href,
  label,
  icon: Icon,
  onClick,
  size = "default",
  tone = "glass",
  to,
  type = "button",
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
    <button type={type} disabled={disabled} onClick={onClick} {...sharedProps}>
      {content}
    </button>
  );
}
