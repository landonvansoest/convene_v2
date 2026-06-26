"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";
import "react-day-picker/style.css";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components,
  ...props
}: CalendarProps) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      navLayout="around"
      className={cn("bg-background p-3 [--cell-size:2.25rem]", className)}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn("relative flex flex-col gap-4", defaultClassNames.months),
        month: cn("relative flex w-full flex-col gap-4", defaultClassNames.month),
        month_caption: cn(
          "flex h-[--cell-size] w-full items-center justify-center px-[--cell-size]",
          defaultClassNames.month_caption,
        ),
        caption_label: cn("text-sm font-medium", defaultClassNames.caption_label),
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "absolute left-0 top-0 h-[--cell-size] w-[--cell-size] bg-transparent p-0 opacity-50 hover:opacity-100",
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "absolute right-0 top-0 h-[--cell-size] w-[--cell-size] bg-transparent p-0 opacity-50 hover:opacity-100",
          defaultClassNames.button_next,
        ),
        month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
        weekdays: cn("flex w-full", defaultClassNames.weekdays),
        weekday: cn(
          "text-muted-foreground flex-1 select-none text-center text-[0.8rem] font-normal",
          defaultClassNames.weekday,
        ),
        week: cn("mt-2 flex w-full", defaultClassNames.week),
        day: cn(
          "relative flex-1 p-0 text-center focus-within:relative focus-within:z-20",
          defaultClassNames.day,
        ),
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "mx-auto size-[--cell-size] p-0 font-normal aria-selected:opacity-100",
          defaultClassNames.day_button,
        ),
        selected: cn(
          "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground",
          defaultClassNames.selected,
        ),
        today: cn("[&>button]:bg-accent [&>button]:text-accent-foreground", defaultClassNames.today),
        outside: cn(
          "text-muted-foreground opacity-50 aria-selected:text-muted-foreground",
          defaultClassNames.outside,
        ),
        disabled: cn("text-muted-foreground opacity-50", defaultClassNames.disabled),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClass, ...chevronProps }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
          return <Icon className={cn("h-4 w-4", chevronClass)} {...chevronProps} />;
        },
        ...components,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
