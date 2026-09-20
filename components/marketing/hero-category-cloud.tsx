"use client";

import {
  AnimatePresence,
  motion,
  MotionConfig,
  useReducedMotion,
} from "motion/react";
import type { LucideIcon } from "lucide-react";
import {
  createElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { categoryIcon } from "@/components/deals/category-icons";
import { DEAL_CATEGORY_CATALOG } from "@/lib/matching/categories";

const HERO_CATEGORIES = DEAL_CATEGORY_CATALOG.filter(
  (item) => item.slug !== "other",
);

type Breakpoint = "mobile" | "tablet" | "desktop";

type Slot = {
  id: string;
  top: string;
  left?: string;
  right?: string;
};

type ActiveChip = {
  id: string;
  slug: string;
  name: string;
  slotId: string;
  Icon: LucideIcon;
  position: Pick<Slot, "top" | "left" | "right">;
  scale: number;
  enterScale: number;
  enterY: number;
  enterRotate: number;
  floatX: number;
  floatY: number;
  floatRotate: number;
  floatDuration: number;
  reduceMotion: boolean;
};

const DESKTOP_SLOTS: Slot[] = [
  { id: "dl-1", left: "1.25rem", top: "9%" },
  { id: "dl-2", left: "0.85rem", top: "26%" },
  { id: "dl-3", left: "1.6rem", top: "44%" },
  { id: "dl-4", left: "0.95rem", top: "62%" },
  { id: "dr-1", right: "1.25rem", top: "11%" },
  { id: "dr-2", right: "0.8rem", top: "29%" },
  { id: "dr-3", right: "1.7rem", top: "47%" },
  { id: "dr-4", right: "1rem", top: "64%" },
];

const TABLET_SLOTS: Slot[] = [
  { id: "tl-1", left: "0.85rem", top: "0.85rem" },
  { id: "tr-1", right: "0.85rem", top: "1.15rem" },
  { id: "tl-2", left: "0.75rem", top: "5.25rem" },
  { id: "tr-2", right: "0.75rem", top: "5.75rem" },
];

const MOBILE_SLOTS: Slot[] = [
  { id: "ml-1", left: "0.65rem", top: "0.55rem" },
  { id: "mr-1", right: "0.65rem", top: "0.85rem" },
];

const PRESETS: Record<
  Breakpoint,
  { maxVisible: number; scale: number; float: number; slots: Slot[] }
> = {
  mobile: { maxVisible: 2, scale: 0.82, float: 0.35, slots: MOBILE_SLOTS },
  tablet: { maxVisible: 3, scale: 0.9, float: 0.65, slots: TABLET_SLOTS },
  desktop: { maxVisible: 5, scale: 1, float: 1, slots: DESKTOP_SLOTS },
};

const EASE_PREMIUM = [0.2, 0, 0, 1] as const;

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pick<T>(items: T[]): T | undefined {
  if (items.length === 0) {
    return undefined;
  }

  return items[Math.floor(Math.random() * items.length)];
}

function useHeroBreakpoint() {
  const [breakpoint, setBreakpoint] = useState<Breakpoint | null>(null);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1280px)");
    const tablet = window.matchMedia("(min-width: 768px)");

    const update = () => {
      if (desktop.matches) {
        setBreakpoint("desktop");
        return;
      }

      if (tablet.matches) {
        setBreakpoint("tablet");
        return;
      }

      setBreakpoint("mobile");
    };

    update();
    desktop.addEventListener("change", update);
    tablet.addEventListener("change", update);

    return () => {
      desktop.removeEventListener("change", update);
      tablet.removeEventListener("change", update);
    };
  }, []);

  return breakpoint;
}

let chipSeq = 0;

function createChip({
  slot,
  category,
  preset,
  reduceMotion,
}: {
  slot: Slot;
  category: (typeof HERO_CATEGORIES)[number];
  preset: (typeof PRESETS)[Breakpoint];
  reduceMotion: boolean;
}): ActiveChip {
  const jitterX = reduceMotion ? 0 : rand(-10, 10);
  const jitterY = reduceMotion ? 0 : rand(-8, 8);
  chipSeq += 1;

  return {
    id: `hero-cat-${chipSeq}`,
    slug: category.slug,
    name: category.name,
    slotId: slot.id,
    Icon: categoryIcon(category.slug),
    position: {
      top: `calc(${slot.top} + ${jitterY}px)`,
      ...(slot.left != null
        ? { left: `calc(${slot.left} + ${jitterX}px)` }
        : { right: `calc(${slot.right ?? "1rem"} + ${jitterX}px)` }),
    },
    scale: reduceMotion ? preset.scale : preset.scale * rand(0.96, 1.04),
    enterScale: rand(0.78, 0.9),
    enterY: rand(8, 14),
    enterRotate: rand(-6, 6),
    floatX: rand(2, 4) * preset.float,
    floatY: rand(3, 6) * preset.float,
    floatRotate: rand(1, 2) * preset.float,
    floatDuration: rand(7.5, 10.5),
    reduceMotion,
  };
}

function FloatingCategory({ item }: { item: ActiveChip }) {
  return (
    <motion.div
      className="absolute will-change-transform"
      style={item.position}
      initial={
        item.reduceMotion
          ? { opacity: 0 }
          : {
              opacity: 0,
              scale: item.enterScale,
              y: item.enterY,
              rotate: item.enterRotate,
              filter: "blur(6px)",
            }
      }
      animate={
        item.reduceMotion
          ? { opacity: 0.92 }
          : {
              opacity: 1,
              scale: item.scale,
              filter: "blur(0px)",
              x: [0, item.floatX, -item.floatX * 0.55, 0],
              y: [0, -item.floatY, item.floatY * 0.4, 0],
              rotate: [0, item.floatRotate, -item.floatRotate * 0.45, 0],
            }
      }
      exit={
        item.reduceMotion
          ? { opacity: 0, transition: { duration: 0.16, ease: "easeOut" } }
          : {
              opacity: 0,
              scale: 0.93,
              y: -8,
              filter: "blur(5px)",
              transition: { duration: 0.18, ease: "easeOut" },
            }
      }
      transition={
        item.reduceMotion
          ? { duration: 0.28, ease: "easeOut" }
          : {
              opacity: { duration: 0.45, ease: EASE_PREMIUM },
              scale: { type: "spring", duration: 0.55, bounce: 0 },
              filter: { duration: 0.4, ease: EASE_PREMIUM },
              x: {
                duration: item.floatDuration,
                repeat: Infinity,
                ease: "easeInOut",
              },
              y: {
                duration: item.floatDuration * 1.12,
                repeat: Infinity,
                ease: "easeInOut",
              },
              rotate: {
                duration: item.floatDuration * 1.2,
                repeat: Infinity,
                ease: "easeInOut",
              },
            }
      }
    >
      <div className="flex max-w-[11.25rem] items-center gap-2 rounded-full border border-border/80 bg-background/75 py-1.5 pr-3 pl-1.5 shadow-[0_10px_28px_-18px_color-mix(in_srgb,var(--navy)_42%,transparent)] backdrop-blur-md">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[0.65rem] bg-gradient-to-br from-primary/14 via-background to-intelligence/12 shadow-[inset_0_1px_0_oklch(1_0_0/0.72)] ring-1 ring-border/70">
          {createElement(item.Icon, {
            className: "size-4 text-primary",
            strokeWidth: 1.75,
            "aria-hidden": true,
          })}
        </span>
        <span className="min-w-0 text-left text-[0.75rem] leading-tight font-medium text-foreground">
          {item.name}
        </span>
      </div>
    </motion.div>
  );
}

function staticChips(breakpoint: Breakpoint) {
  const preset = PRESETS[breakpoint];
  const count = Math.min(preset.maxVisible, preset.slots.length);
  return HERO_CATEGORIES.slice(0, count).map((category, index) =>
    createChip({
      slot: preset.slots[index] ?? preset.slots[0],
      category,
      preset,
      reduceMotion: true,
    }),
  );
}

function HeroCategoryCloudRuntime({
  breakpoint,
  reduceMotion,
}: {
  breakpoint: Breakpoint;
  reduceMotion: boolean;
}) {
  const preset = PRESETS[breakpoint];
  const [items, setItems] = useState<ActiveChip[]>(() =>
    reduceMotion ? staticChips(breakpoint) : [],
  );
  const itemsRef = useRef(items);

  useEffect(() => {
    if (reduceMotion) {
      return;
    }

    const timers = new Set<number>();
    let cancelled = false;

    const later = (fn: () => void, delay: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, delay);
      timers.add(id);
    };

    const spawn = () => {
      if (cancelled) {
        return;
      }

      const current = itemsRef.current;
      if (current.length >= preset.maxVisible) {
        later(spawn, rand(1800, 3200));
        return;
      }

      const usedSlots = new Set(current.map((item) => item.slotId));
      const usedCategories = new Set(current.map((item) => item.slug));
      const slot = pick(preset.slots.filter((item) => !usedSlots.has(item.id)));
      const category = pick(
        HERO_CATEGORIES.filter((item) => !usedCategories.has(item.slug)),
      );

      if (!slot || !category) {
        later(spawn, rand(1800, 3200));
        return;
      }

      const chip = createChip({
        slot,
        category,
        preset,
        reduceMotion: false,
      });

      setItems((prev) => {
        const next = [...prev, chip];
        itemsRef.current = next;
        return next;
      });
      later(() => {
        setItems((prev) => {
          const next = prev.filter((item) => item.id !== chip.id);
          itemsRef.current = next;
          return next;
        });
      }, rand(4000, 7000));
      later(spawn, rand(1800, 3200));
    };

    later(spawn, rand(240, 480));
    later(spawn, rand(900, 1400));
    if (breakpoint === "desktop") {
      later(spawn, rand(1700, 2300));
    }

    return () => {
      cancelled = true;
      for (const id of timers) {
        window.clearTimeout(id);
      }
    };
  }, [breakpoint, preset, reduceMotion]);

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence presenceAffectsLayout={false}>
        {items.map((item) => (
          <FloatingCategory key={item.id} item={item} />
        ))}
      </AnimatePresence>
    </MotionConfig>
  );
}

function CloudFrame({ children }: { children?: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {children}
    </div>
  );
}

export function HeroCategoryCloud() {
  const reduceMotion = useReducedMotion();
  const breakpoint = useHeroBreakpoint();

  if (breakpoint == null || reduceMotion == null) {
    return <CloudFrame />;
  }

  return (
    <CloudFrame>
      <HeroCategoryCloudRuntime
        key={`${breakpoint}-${String(reduceMotion)}`}
        breakpoint={breakpoint}
        reduceMotion={reduceMotion}
      />
    </CloudFrame>
  );
}
