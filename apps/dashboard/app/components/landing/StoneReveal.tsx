import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { useRef, type PointerEvent } from "react";

type Side = "left" | "right";

interface StoneRevealProps {
  side: Side;
  baseSrc: string;
  grassSrc: string;
  zBase: number;
  zGrass: number;
}

export default function StoneReveal({ side, baseSrc, grassSrc, zBase, zGrass }: StoneRevealProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const radiusTarget = useMotionValue(0);

  const radius = useSpring(radiusTarget, {
    stiffness: 200,
    damping: 25,
  });

  const mask = useMotionTemplate`
    radial-gradient(
      circle ${radius}px at ${x}px ${y}px,
      black 0%,
      black 40%,
      transparent 100%
    )
  `;

  const objectPosition = side === "left" ? "left bottom" : "right bottom";
  const enterX = side === "left" ? -40 : 40;

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (shouldReduceMotion) return;

    const bounds = wrapperRef.current?.getBoundingClientRect();
    if (!bounds) return;

    x.set(event.clientX - bounds.left);
    y.set(event.clientY - bounds.top);
  }

  function handlePointerEnter() {
    if (!shouldReduceMotion) {
      radiusTarget.set(120);
    }
  }

  function handlePointerLeave() {
    radiusTarget.set(0);
  }

  return (
    <div
      ref={wrapperRef}
      aria-hidden="true"
      className="absolute bottom-0 w-fit"
      style={{ [side]: 0 }}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
    >
      <motion.img
        src={baseSrc}
        alt=""
        draggable={false}
        initial={shouldReduceMotion ? false : { opacity: 0, x: enterX }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.9, delay: 0.5, ease: "easeOut" }}
        className="block h-[280px] w-auto select-none sm:h-[380px] md:h-[500px] lg:h-[600px] xl:h-[680px]"
        style={{
          objectFit: "contain",
          objectPosition,
          position: "relative",
          zIndex: zBase,
        }}
      />

      <motion.img
        src={grassSrc}
        alt=""
        draggable={false}
        className="pointer-events-none absolute bottom-0 h-[280px] w-auto select-none sm:h-[380px] md:h-[500px] lg:h-[600px] xl:h-[680px]"
        style={{
          [side]: 0,
          objectFit: "contain",
          objectPosition,
          zIndex: zGrass,
          maskImage: mask,
          WebkitMaskImage: mask,
        }}
      />
    </div>
  );
}
