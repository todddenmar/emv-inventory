import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const BRAND_NAME = "LP Marketing";
export const BRAND_LOGO_SRC = "/images/logo.png";

const sizeMap = {
  sm: { dimension: 32, className: "h-8 w-8" },
  md: { dimension: 40, className: "h-10 w-10" },
  lg: { dimension: 72, className: "h-[4.5rem] w-[4.5rem]" },
  xl: { dimension: 112, className: "h-28 w-28" },
  "2xl": { dimension: 144, className: "h-36 w-36 sm:h-40 sm:w-40" },
  "3xl": { dimension: 224, className: "h-48 w-48 sm:h-56 sm:w-56" },
  "4xl": { dimension: 320, className: "h-56 w-56 sm:h-64 sm:w-64 lg:h-80 lg:w-80" },
  "5xl": {
    dimension: 384,
    className: "h-64 w-64 sm:h-80 sm:w-80 lg:h-96 lg:w-96",
  },
} as const;

interface BrandLogoProps {
  size?: keyof typeof sizeMap;
  showName?: boolean;
  /** When false, only the text name is shown (no logo image). */
  showImage?: boolean;
  href?: string;
  className?: string;
  nameClassName?: string;
  priority?: boolean;
}

export function BrandLogo({
  size = "sm",
  showName = true,
  showImage = true,
  href,
  className,
  nameClassName,
  priority = false,
}: BrandLogoProps) {
  const { dimension, className: imageClassName } = sizeMap[size];

  const content = (
    <>
      {showImage ? (
        <Image
          src={BRAND_LOGO_SRC}
          alt={BRAND_NAME}
          width={dimension}
          height={dimension}
          className={cn("shrink-0 rounded-full object-cover", imageClassName)}
          priority={priority}
        />
      ) : null}
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
