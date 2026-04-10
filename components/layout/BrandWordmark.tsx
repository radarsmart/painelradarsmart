"use client";

type BrandWordmarkProps = {
  variant?: "header" | "footer";
  className?: string;
};

export default function BrandWordmark({
  variant = "header",
  className = "",
}: BrandWordmarkProps) {
  const isFooter = variant === "footer";

  const radarClass = isFooter
    ? "text-white group-hover:text-[#9e6a18]"
    : "text-[#22223B] group-hover:text-[#9e6a18]";

  const smartClass = isFooter
    ? "text-[#D39B32] group-hover:text-white"
    : "text-[#9e6a18] group-hover:text-[#22223B]";

  return (
    <span
      className={[
        "inline-flex items-center text-xl font-black uppercase tracking-[0.18em] leading-none transition-colors duration-200",
        className,
      ].join(" ")}
    >
      <span className={`transition-colors duration-200 ${radarClass}`}>RADAR</span>
      <span className={`ml-1 transition-colors duration-200 ${smartClass}`}>SMART</span>
    </span>
  );
}
