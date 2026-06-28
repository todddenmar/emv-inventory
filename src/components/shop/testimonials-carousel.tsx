"use client";

import { Quote } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  TestimonialsSectionSkeleton,
  TestimonialSkeleton,
} from "@/components/shop/home-skeletons";
import { cn } from "@/lib/utils";
import type { Testimonial } from "@/types";

interface TestimonialsCarouselProps {
  testimonials: Testimonial[];
  loading?: boolean;
  variant?: "default" | "home";
  dark?: boolean;
}

export function TestimonialsCarousel({
  testimonials,
  loading,
  variant = "default",
  dark = false,
}: TestimonialsCarouselProps) {
  const isHome = variant === "home";
  const isDark = isHome && dark;

  if (loading) {
    return <TestimonialsSectionSkeleton variant={variant} dark={dark} />;
  }

  if (testimonials.length === 0) {
    return (
      <section className="space-y-4">
        <h2
          className={cn(
            "text-2xl font-bold sm:text-3xl",
            isDark ? "text-brand-yellow" : isHome && "text-brand-black"
          )}
        >
          Happy customers
        </h2>
        <TestimonialSkeleton variant={variant} dark={dark} />
        <p
          className={cn(
            "text-center text-sm",
            isDark ? "text-brand-yellow/70" : "text-muted-foreground"
          )}
        >
          Customer stories will appear here soon.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        {isHome && (
          <p
            className={cn(
              "mb-2 text-xs font-semibold uppercase tracking-widest",
              isDark ? "text-brand-yellow/70" : "text-brand-yellow"
            )}
          >
            Testimonials
          </p>
        )}
        <h2
          className={cn(
            "text-2xl font-bold sm:text-3xl",
            isDark ? "text-brand-yellow" : isHome && "text-brand-black"
          )}
        >
          Happy customers
        </h2>
      </div>
      <div className="relative px-10 sm:px-12">
        <Carousel opts={{ align: "start", loop: testimonials.length > 1 }}>
          <CarouselContent>
            {testimonials.map((item) => (
              <CarouselItem
                key={item.id}
                className="basis-full md:basis-1/2 lg:basis-1/3"
              >
                <div
                  className={cn(
                    "flex h-full flex-col rounded-2xl border p-5",
                    isDark
                      ? "border-brand-yellow/20 bg-brand-yellow/5"
                      : isHome
                        ? "border-brand-yellow/30 bg-white shadow-sm"
                        : "bg-card"
                  )}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={cn(
                        "h-16 w-16 shrink-0 overflow-hidden rounded-full",
                        isDark || isHome
                          ? "ring-2 ring-brand-yellow/40"
                          : "bg-muted"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.customerImageUrl}
                        alt={item.customerName}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "font-semibold",
                          isDark
                            ? "text-brand-yellow"
                            : isHome && "text-brand-black"
                        )}
                      >
                        {item.customerName}
                      </p>
                      {item.quote && (
                        <p
                          className={cn(
                            "mt-2 line-clamp-3 text-sm",
                            isDark
                              ? "text-brand-yellow/80"
                              : "text-muted-foreground"
                          )}
                        >
                          <Quote className="mr-1 inline h-3 w-3" />
                          {item.quote}
                        </p>
                      )}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "mt-4 flex items-center gap-3 border-t pt-4",
                      (isDark || isHome) && "border-brand-yellow/20"
                    )}
                  >
                    {item.productImageUrl && (
                      <div
                        className={cn(
                          "h-14 w-14 shrink-0 overflow-hidden rounded-lg",
                          isDark || isHome
                            ? "ring-1 ring-brand-yellow/30"
                            : "bg-muted"
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.productImageUrl}
                          alt={item.productName}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "text-xs",
                          isDark
                            ? "text-brand-yellow/60"
                            : "text-muted-foreground"
                        )}
                      >
                        Purchased
                      </p>
                      <p
                        className={cn(
                          "truncate text-sm font-medium",
                          isDark
                            ? "text-brand-yellow"
                            : isHome && "text-brand-black"
                        )}
                      >
                        {item.productName}
                      </p>
                    </div>
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          {testimonials.length > 1 && (
            <>
              <CarouselPrevious
                className={cn(
                  "left-0 border-0",
                  isDark
                    ? "bg-brand-yellow/10 text-brand-yellow hover:bg-brand-yellow/20"
                    : "border-brand-yellow/30 bg-white hover:bg-brand-yellow/10"
                )}
              />
              <CarouselNext
                className={cn(
                  "right-0 border-0",
                  isDark
                    ? "bg-brand-yellow/10 text-brand-yellow hover:bg-brand-yellow/20"
                    : "border-brand-yellow/30 bg-white hover:bg-brand-yellow/10"
                )}
              />
            </>
          )}
        </Carousel>
      </div>
    </section>
  );
}
