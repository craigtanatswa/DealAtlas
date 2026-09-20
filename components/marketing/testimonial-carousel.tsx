"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  QuoteIcon,
} from "lucide-react";
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
} from "motion/react";

import {
  HOME_TESTIMONIALS,
  type HomeTestimonial,
} from "@/components/marketing/testimonial-data";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MARQUEE_PX_PER_SECOND = 28;
const TESTIMONIAL_COUNT = HOME_TESTIMONIALS.length;
const LOOPED_TESTIMONIALS = [0, 1].flatMap((copy) =>
  HOME_TESTIMONIALS.map((testimonial) => ({
    testimonial,
    copy,
    loopKey: `${copy}-${testimonial.id}`,
  })),
);

function TestimonialCard({ testimonial }: { testimonial: HomeTestimonial }) {
  return (
    <article className="flex h-full min-h-[17.5rem] flex-col gap-5 rounded-[1.25rem] border border-border bg-background p-6 shadow-[0_10px_28px_-22px_color-mix(in_srgb,var(--navy)_38%,transparent)] transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_16px_32px_-20px_color-mix(in_srgb,var(--navy)_42%,transparent)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <QuoteIcon
        className="size-5 text-primary/45"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <p className="flex-1 text-pretty text-[0.9375rem] leading-7 text-foreground">
        {testimonial.quote}
      </p>
      <footer className="mt-auto flex flex-col gap-0.5">
        <p className="font-medium text-foreground">{testimonial.name}</p>
        <p className="text-[0.8125rem] leading-5 text-pretty text-muted-foreground">
          {testimonial.company}
        </p>
        <p className="text-[0.8125rem] leading-5 text-pretty text-muted-foreground">
          {testimonial.industry}
        </p>
      </footer>
    </article>
  );
}

function wrapOffset(value: number, loopWidth: number) {
  if (loopWidth <= 0) {
    return 0;
  }

  const wrapped = value % loopWidth;
  return wrapped > 0 ? wrapped - loopWidth : wrapped;
}

export function TestimonialCarousel() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const itemRef = useRef<HTMLLIElement>(null);
  const hoverRef = useRef(false);
  const focusRef = useRef(false);
  const x = useMotionValue(0);
  const reduceMotion = useReducedMotion();
  const [stride, setStride] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const labelId = useId();
  const loopWidth = stride * TESTIMONIAL_COUNT;

  const shiftBy = useCallback(
    (step: number) => {
      if (!stride) {
        return;
      }
      x.set(wrapOffset(x.get() - step * stride, stride * TESTIMONIAL_COUNT));
    },
    [stride, x],
  );

  const goToLogical = useCallback(
    (logicalIndex: number) => {
      if (!stride) {
        return;
      }
      x.set(wrapOffset(-logicalIndex * stride, stride * TESTIMONIAL_COUNT));
    },
    [stride, x],
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    const item = itemRef.current;
    const track = item?.parentElement;
    if (!viewport || !item || !track) {
      return;
    }

    const measure = () => {
      const styles = getComputedStyle(track);
      const gap = Number.parseFloat(styles.columnGap || styles.gap) || 16;
      const nextStride = item.getBoundingClientRect().width + gap;
      if (nextStride > 0) {
        setStride((current) =>
          Math.abs(current - nextStride) < 0.5 ? current : nextStride,
        );
      }
    };

    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(item);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!loopWidth) {
      return;
    }
    x.set(wrapOffset(x.get(), loopWidth));
  }, [loopWidth, x]);

  useAnimationFrame((_, delta) => {
    if (
      hoverRef.current ||
      focusRef.current ||
      reduceMotion ||
      reduceMotion == null ||
      !loopWidth ||
      document.hidden
    ) {
      return;
    }

    x.set(
      wrapOffset(
        x.get() - (MARQUEE_PX_PER_SECOND * delta) / 1000,
        loopWidth,
      ),
    );
  });

  useMotionValueEvent(x, "change", (latest) => {
    if (!stride) {
      return;
    }
    const next =
      (((Math.round(-latest / stride) % TESTIMONIAL_COUNT) +
        TESTIMONIAL_COUNT) %
        TESTIMONIAL_COUNT);
    setActiveIndex((current) => (current === next ? current : next));
  });

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-labelledby={labelId}
      className="flex flex-col gap-5"
      onMouseEnter={() => {
        hoverRef.current = true;
      }}
      onMouseLeave={() => {
        hoverRef.current = false;
      }}
    >
      <p id={labelId} className="sr-only">
        Customer testimonials
      </p>
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Previous testimonials"
          onClick={() => shiftBy(-1)}
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Next testimonials"
          onClick={() => shiftBy(1)}
        >
          <ChevronRightIcon />
        </Button>
      </div>
      <div
        ref={viewportRef}
        className="min-w-0 overflow-hidden"
        tabIndex={0}
        onFocus={() => {
          focusRef.current = true;
        }}
        onBlur={() => {
          focusRef.current = false;
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            shiftBy(-1);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            shiftBy(1);
          }
        }}
      >
        <motion.ul className="flex w-full flex-nowrap gap-4" style={{ x }}>
          {LOOPED_TESTIMONIALS.map((item, index) => (
            <li
              key={item.loopKey}
              ref={index === 0 ? itemRef : undefined}
              data-testimonial-card={item.copy === 0 ? "true" : undefined}
              aria-hidden={item.copy !== 0}
              className="w-[min(85%,22.5rem)] shrink-0 md:w-[calc(47%-0.5rem)] lg:w-[calc(31.2%-0.55rem)]"
            >
              <TestimonialCard testimonial={item.testimonial} />
            </li>
          ))}
        </motion.ul>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {HOME_TESTIMONIALS.map((testimonial, index) => {
          const selected = index === activeIndex;
          return (
            <button
              key={testimonial.id}
              type="button"
              aria-label={`Show testimonial from ${testimonial.name}`}
              aria-current={selected ? "true" : undefined}
              className="flex size-11 items-center justify-center rounded-full transition-colors duration-300 ease-out focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              onClick={() => goToLogical(index)}
            >
              <span
                className={cn(
                  "size-2 rounded-full transition-[background-color,transform] duration-300 ease-out",
                  selected ? "scale-110 bg-primary" : "bg-border",
                )}
              />
            </button>
          );
        })}
      </div>
      <span className="sr-only" aria-live="polite">
        Showing testimonial {activeIndex + 1} of {TESTIMONIAL_COUNT}
      </span>
    </div>
  );
}
