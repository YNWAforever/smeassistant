"use client"

import { BarChart3, Building2, FileClock, Home, LockKeyhole, MoreHorizontal, PlusCircle, ShieldCheck, Sparkles } from "lucide-react"
import { type ReactNode } from "react"

export function PageIntro({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="page-intro">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-intro-actions">{actions}</div>}
    </header>
  )
}


export function SectionCard({ children, className = "", as: Tag = "section" }: { children: ReactNode; className?: string; as?: "section" | "article" | "div" }) {
  return <Tag className={`section-card ${className}`}>{children}</Tag>
}

export const workspaceIcons = {
  home: Home,
  actions: FileClock,
  create: PlusCircle,
  insights: BarChart3,
  more: MoreHorizontal,
  security: ShieldCheck,
  business: Building2,
  lock: LockKeyhole,
  sparkles: Sparkles,
}
