import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "./utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent(props: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  const { className, ...rest } = props;
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 bg-black/30" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 w-[95vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-4 shadow-xl",
          className
        )}
        {...rest}
      />
    </DialogPrimitive.Portal>
  );
}
export function DialogHeader({ children }: { children: React.ReactNode }) {
  return <div className="mb-2">{children}</div>;
}
export function DialogTitle(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div className="text-lg font-semibold" {...props} />;
}
export function DialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 flex justify-end gap-2">{children}</div>;
}
