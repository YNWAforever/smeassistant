"use client"

import type { ReactNode } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { copy, type PrototypeLocale } from "@/lib/copy"

/** Confirmation for consequential steps (approve, export, delete). The trigger is the caller's button. */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive = false,
  locale,
}: {
  trigger: ReactNode
  title: string
  description?: string
  confirmLabel?: string
  onConfirm: () => void
  destructive?: boolean
  locale: PrototypeLocale
}) {
  const t = copy[locale].ui.confirm
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11">{t.cancel}</AlertDialogCancel>
          <AlertDialogAction className={`min-h-11${destructive ? " bg-danger text-paper" : ""}`} onClick={onConfirm}>{confirmLabel ?? t.confirm}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
