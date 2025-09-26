import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { cn } from "./utils";

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(function SelectTrigger({ className, ...p }, ref) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      {...p}
      className={cn(
        "h-9 w-full rounded-xl border border-gray-300 bg-white px-3 text-left text-sm outline-none focus:ring-2 focus:ring-black/20",
        className
      )}
    />
  );
});

export const SelectContent = (p: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      className={cn("z-50 overflow-hidden rounded-xl border bg-white shadow-lg", p.className)}
      position="popper"
      {...p}
    />
  </SelectPrimitive.Portal>
);

export const SelectItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(function SelectItem({ className, ...p }, ref) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn("cursor-pointer px-3 py-2 text-sm outline-none data-[highlighted]:bg-gray-100", className)}
      {...p}
    />
  );
});
