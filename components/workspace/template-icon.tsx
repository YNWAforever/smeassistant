import {
  Camera,
  Clock3,
  FileText,
  Globe2,
  Images,
  Languages,
  Link2,
  ListChecks,
  MapPin,
  Megaphone,
  MessageSquareHeart,
  Search,
  Star,
  Tag,
  UserRound,
  type LucideIcon,
} from "lucide-react"

/**
 * One picture per kind of task, so an owner can scan the list by shape
 * before reading. Decorative: the title next to it always says the same thing.
 */
const TEMPLATE_ICONS: Record<string, { icon: LucideIcon; tone: string }> = {
  "review-response": { icon: MessageSquareHeart, tone: "reviews" },
  "review-request": { icon: Star, tone: "reviews" },
  "gbp-profile-fix": { icon: Clock3, tone: "google" },
  "gbp-photo-pack": { icon: Camera, tone: "google" },
  "gbp-post": { icon: Megaphone, tone: "google" },
  "social-post": { icon: Images, tone: "social" },
  "ig-bio": { icon: UserRound, tone: "social" },
  "ig-highlights": { icon: ListChecks, tone: "social" },
  "visibility-content": { icon: Search, tone: "search" },
  "website-basics": { icon: Globe2, tone: "search" },
  "local-seo-brief": { icon: MapPin, tone: "search" },
  "menu-translation": { icon: Languages, tone: "content" },
  "offer-instagram-post": { icon: Tag, tone: "social" },
  "offer-google-post": { icon: Tag, tone: "google" },
  "google-reconnect": { icon: Link2, tone: "google" },
}

export function TemplateIcon({ templateKey, size = "md" }: { templateKey: string; size?: "sm" | "md" | "lg" }) {
  const entry = TEMPLATE_ICONS[templateKey] ?? { icon: FileText, tone: "content" }
  const Icon = entry.icon
  return <span className="template-icon" data-tone={entry.tone} data-size={size} aria-hidden="true"><Icon /></span>
}
