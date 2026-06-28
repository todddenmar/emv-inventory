import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const BRAND_NAME = "El Mio Vicente";
export const BRAND_LOGO_SRC = "/images/logo.png";

const sizeMap = {
  sm: { dimension: 32, className: "h-8 w-8" },
  md: { dimension: 40, className: "h-10 w-10" },
  lg: { dimension: 72, className: "h-[4.5rem] w-[4.5rem]" },
  xl: { dimension: 112, className: "h-28 w-28" },
} as const;

interface BrandLogoProps {
  size?: keyof typeof sizeMap;
  showName?: boolean;
  href?: string;
  className?: string;
  nameClassName?: string;
  priority?: boolean;
}

export function BrandLogo({
  size = "sm",
  showName = true,
  href,
  className,
  nameClassName,
  priority = false,
}: BrandLogoProps) {
  const { dimension, className: imageClassName } = sizeMap[size];

  const content = (
    <>
      <Image
        src={BRAND_LOGO_SRC}
        alt={BRAND_NAME}
        width={dimension}
        height={dimension}
        className={cn("shrink-0 rounded-full object-cover", imageClassName)}
        priority={priority}
      />
      {showName && (
        <span className={cn("truncate font-semibold", nameClassName)}>
          {BRAND_NAME}
        </span>
      )}
    </>
  );

  const wrapperClass = cn("flex min-w-0 items-center gap-2.5", className);

  if (href) {
    return (
      <Link href={href} className={wrapperClass}>
        {content}
      </Link>
    );
  }

  return <div className={wrapperClass}>{content}</div>;
}
