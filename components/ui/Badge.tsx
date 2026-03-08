import clsx from "clsx";

type BadgeProps = {
  children: React.ReactNode;
  variant?: "default" | "success" | "danger" | "warning";
  className?: string;
};

const variantClass: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "bg-navy-2 text-white",
  success: "bg-rs-green text-white",
  danger: "bg-rs-red text-white",
  warning: "bg-orange-3 text-navy",
};

export default function Badge({
  children,
  variant = "default",
  className,
}: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        variantClass[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
