type Side = "left" | "right";

interface StoneRevealProps {
  side: Side;
  baseSrc: string;
  grassSrc: string;
  zBase: number;
  zGrass: number;
}

export default function StoneReveal({ side, baseSrc, grassSrc, zBase, zGrass }: StoneRevealProps) {
  const objectPosition = side === "left" ? "left bottom" : "right bottom";

  return (
    <div
      aria-hidden="true"
      className="landing-stone-reveal absolute bottom-0 w-fit"
      style={{ [side]: 0 }}
    >
      <img
        src={baseSrc}
        alt=""
        draggable={false}
        className="block h-[280px] w-auto select-none sm:h-[380px] md:h-[500px] lg:h-[600px] xl:h-[680px]"
        style={{
          objectFit: "contain",
          objectPosition,
          position: "relative",
          zIndex: zBase,
        }}
      />

      <img
        src={grassSrc}
        alt=""
        draggable={false}
        className="landing-stone-reveal__grass pointer-events-none absolute bottom-0 h-[280px] w-auto select-none sm:h-[380px] md:h-[500px] lg:h-[600px] xl:h-[680px]"
        style={{
          [side]: 0,
          objectFit: "contain",
          objectPosition,
          zIndex: zGrass,
        }}
      />
    </div>
  );
}
