import Link from "next/link";
import type { ReactNode } from "react";

import {
  GUIDE_CTA_POSITION_ATTR,
  GUIDE_CTA_TARGET_ATTR,
  guideCtaTarget,
} from "@/lib/analytics/guide-cta";
import { blockCtaPositions, type Block, type BlockCtaPosition, type Inline } from "@/lib/guides/markdown";
import { cn } from "@/lib/utils";

const LINK_CLASS =
  "font-medium text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:rounded-sm focus-visible:outline-none";

type RenderOptions = {
  /** Same-site /guides/* paths that are live. Links to any other guide render as plain text. */
  publishedGuidePaths: ReadonlySet<string>;
  /** Section position of the block being rendered, for guide CTA analytics. */
  ctaPosition?: BlockCtaPosition;
};

function isUnpublishedGuideLink(href: string, options: RenderOptions): boolean {
  const pathOnly = href.split(/[?#]/)[0].replace(/\/$/, "");
  return (
    pathOnly.startsWith("/guides/") && !options.publishedGuidePaths.has(pathOnly)
  );
}

function renderInline(nodes: Inline[], options: RenderOptions, keyPrefix = "i"): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.type) {
      case "text":
        return node.value;
      case "code":
        return (
          <code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.875em]">
            {node.value}
          </code>
        );
      case "strong":
        return (
          <strong key={key} className="font-semibold text-foreground">
            {renderInline(node.children, options, key)}
          </strong>
        );
      case "em":
        return <em key={key}>{renderInline(node.children, options, key)}</em>;
      case "link": {
        const children = renderInline(node.children, options, key);
        if (isUnpublishedGuideLink(node.href, options)) {
          return <span key={key}>{children}</span>;
        }
        if (node.href.startsWith("/") || node.href.startsWith("#")) {
          const ctaTarget = guideCtaTarget(node.href);
          const ctaAttrs =
            ctaTarget && options.ctaPosition
              ? {
                  [GUIDE_CTA_TARGET_ATTR]: ctaTarget,
                  [GUIDE_CTA_POSITION_ATTR]: options.ctaPosition,
                }
              : {};
          return (
            <Link key={key} href={node.href} className={LINK_CLASS} {...ctaAttrs}>
              {children}
            </Link>
          );
        }
        return (
          <a key={key} href={node.href} className={LINK_CLASS} rel="noopener noreferrer">
            {children}
          </a>
        );
      }
    }
  });
}

const HEADING_CLASS = {
  2: "mt-6 scroll-mt-24 text-[1.5rem] leading-snug font-semibold tracking-tight text-balance text-foreground md:text-[1.75rem]",
  3: "mt-2 scroll-mt-24 text-lg leading-snug font-semibold tracking-tight text-balance text-foreground md:text-xl",
  4: "scroll-mt-24 text-base leading-snug font-semibold text-foreground",
} as const;

export function GuideMarkdown({
  blocks,
  publishedGuidePaths,
  className,
}: {
  blocks: Block[];
  publishedGuidePaths: ReadonlySet<string>;
  className?: string;
}) {
  const positions = blockCtaPositions(blocks);

  return (
    <div
      className={cn(
        "flex flex-col gap-5 text-[0.9375rem] leading-7 text-pretty text-muted-foreground md:text-base",
        className,
      )}
    >
      {blocks.map((block, index) => {
        const key = `b-${index}`;
        const options: RenderOptions = { publishedGuidePaths, ctaPosition: positions[index] };
        switch (block.type) {
          case "heading": {
            const Tag = `h${block.level}` as const;
            return (
              <Tag key={key} id={block.id} className={HEADING_CLASS[block.level]}>
                {renderInline(block.children, options, key)}
              </Tag>
            );
          }
          case "paragraph":
            return <p key={key}>{renderInline(block.children, options, key)}</p>;
          case "list": {
            const Tag = block.ordered ? "ol" : "ul";
            return (
              <Tag
                key={key}
                className={cn(
                  "flex flex-col gap-2 pl-6",
                  block.ordered ? "list-decimal" : "list-disc",
                )}
              >
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`} className="pl-1">
                    {renderInline(item, options, `${key}-${itemIndex}`)}
                  </li>
                ))}
              </Tag>
            );
          }
          case "table":
            return (
              <div key={key} className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full border-collapse text-left text-[0.9375rem]">
                  <thead className="bg-muted/60 text-foreground">
                    <tr>
                      {block.head.map((cell, cellIndex) => (
                        <th
                          key={`${key}-h-${cellIndex}`}
                          scope="col"
                          className="border-b border-border px-4 py-3 font-semibold"
                        >
                          {renderInline(cell, options, `${key}-h-${cellIndex}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={`${key}-r-${rowIndex}`} className="border-b border-border last:border-b-0">
                        {row.map((cell, cellIndex) => (
                          <td key={`${key}-r-${rowIndex}-${cellIndex}`} className="px-4 py-3 align-top">
                            {renderInline(cell, options, `${key}-r-${rowIndex}-${cellIndex}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
