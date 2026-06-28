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
import type { Testimonial } from "@/types";

interface TestimonialsCarouselProps {
  testimonials: Testimonial[];
  loading?: boolean;
}

export function TestimonialsCarousel({
  testimonials,
  loading,
}: TestimonialsCarouselProps) {
  if (loading) return <TestimonialsSectionSkeleton />;

  if (testimonials.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-semibold sm:text-2xl">Happy customers</h2>
        <TestimonialSkeleton />
        <p className="text-center text-sm text-muted-foreground">
          Customer stories will appear here soon.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold sm:text-2xl">Happy customers</h2>
      <div className="relative px-10 sm:px-12">
        <Carousel opts={{ align: "start", loop: testimonials.length > 1 }}>
          <CarouselContent>
            {testimonials.map((item) => (
              <CarouselItem
                key={item.id}
                className="basis-full md:basis-1/2 lg:basis-1/3"
              >
                <div className="flex h-full flex-col rounded-xl border bg-card p-5">
                  <div className="flex items-start gap-4">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.customerImageUrl}
                        alt={item.customerName}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{item.customerName}</p>
                      {item.quote && (
                        <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
                          <Quote className="mr-1 inline h-3 w-3" />
                          {item.quote}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-3 border-t pt-4">
                    {(item.productImageUrl) && (
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.productImageUrl}
                          alt={item.productName}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Purchased</p>
                      <p className="truncate text-sm font-medium">
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
              <CarouselPrevious className="left-0" />
              <CarouselNext className="right-0" />
            </>
          )}
        </Carousel>
      </div>
    </section>
  );
}
