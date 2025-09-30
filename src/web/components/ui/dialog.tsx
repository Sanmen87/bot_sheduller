'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from './utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogPortal = DialogPrimitive.Portal
export const DialogOverlay = DialogPrimitive.Overlay
export const DialogClose = DialogPrimitive.Close

// ──────────────────────────────────────────────────────────────────────────────
// Контент модалки
// ──────────────────────────────────────────────────────────────────────────────
export const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(function DialogContent({ className, ...props }, ref) {
  return (
    <DialogPortal>
      <DialogOverlay className="fixed inset-0 bg-black/30" />
      <DialogPrimitive.Content asChild>
        <div
          ref={ref}
          className={cn(
            'fixed left-1/2 top-1/2 w-[95vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-4 shadow-xl focus:outline-none',
            className
          )}
          {...props}
        />
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})

// ──────────────────────────────────────────────────────────────────────────────
// Заголовок и описание (Radix требует Title для доступности)
// ──────────────────────────────────────────────────────────────────────────────
export const DialogHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-2">{children}</div>
)

export const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title asChild>
      <h2 ref={ref} className={cn('text-lg font-semibold', className)} {...props} />
    </DialogPrimitive.Title>
  )
})

export const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description asChild>
      <p ref={ref} className={cn('text-sm text-gray-600', className)} {...props} />
    </DialogPrimitive.Description>
  )
})

export const DialogFooter = ({ children }: { children: React.ReactNode }) => (
  <div className="mt-3 flex justify-end gap-2">{children}</div>
)
