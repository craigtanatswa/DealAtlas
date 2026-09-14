import { Heading } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import { APP_NAME } from "@/lib/constants";

type PagePlaceholderProps = {
  title: string;
  description: string;
};

export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <Main>
      <p className="text-sm font-medium text-muted-foreground">{APP_NAME}</p>
      <Heading>{title}</Heading>
      <p className="max-w-2xl text-[0.9375rem] leading-7 text-muted-foreground">
        {description}
      </p>
    </Main>
  );
}
