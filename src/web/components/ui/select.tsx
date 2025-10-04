// components/ui/select.tsx
import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"
import clsx from "clsx"

export const Select = SelectPrimitive.Root
export const SelectGroup = SelectPrimitive.Group
export const SelectValue = SelectPrimitive.Value

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(function SelectTrigger({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      {...props}
      className={clsx(
        "inline-flex h-9 w-full items-center justify-between rounded-xl border border-gray-300 bg-white px-3 text-left text-sm outline-none",
        "focus:ring-2 focus:ring-black/20 data-[state=open]:ring-2 data-[state=open]:ring-black/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      {children}
      <SelectPrimitive.Icon>
        <ChevronDown className="size-4 opacity-60" aria-hidden="true" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
})

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & {
    position?: "item-aligned" | "popper"
  }
>(function SelectContent(
  { className, position = "popper", children, ...props },
  ref
) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        {...props}
        position={position}
        className={clsx(
          "z-50 min-w-[8rem] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
          className
        )}
      >
        <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center">
          <ChevronUp className="size-4 opacity-60" aria-hidden="true" />
        </SelectPrimitive.ScrollUpButton>

        <SelectPrimitive.Viewport
          className={clsx(
            "p-1",
            position === "popper" &&
              "max-h-[var(--radix-select-content-available-height)]"
          )}
        >
          {children}
        </SelectPrimitive.Viewport>

        <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center">
          <ChevronDown className="size-4 opacity-60" aria-hidden="true" />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
})

export const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(function SelectLabel({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Label
      ref={ref}
      {...props}
      className={clsx("px-2 py-1.5 text-xs text-gray-500", className)}
    />
  )
})

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(function SelectItem({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      {...props}
      className={clsx(
        "relative flex w-full select-none items-center rounded-lg py-1.5 pl-8 pr-2 text-sm outline-none",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "data-[highlighted]:bg-gray-100",
        className
      )}
    >
      <span className="absolute left-2 inline-flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-4" aria-hidden="true" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
})

export const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(function SelectSeparator({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      {...props}
      className={clsx("my-1 h-px bg-gray-200", className)}
    />
  )
})
