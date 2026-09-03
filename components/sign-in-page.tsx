"use client"

import Link from "next/link"
import { useState, type FormEvent } from "react"
import { ArrowRight, Building2, Check, CircleAlert, KeyRound, LockKeyhole, ScanSearch, ShieldCheck } from "lucide-react"

import { PublicPageFrame } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { PrototypeLocale } from "@/lib/copy"

import type { SignInErrorCode } from "@/lib/funnel/sign-in"

function errorCopy(code: SignInErrorCode, isChinese: boolean): string {
  switch (code) {
    case "missing_code":
      return isChinese ? "登入連結不完整，請重新申請一封新的登入電郵。" : "That sign-in link was incomplete. Request a fresh one below."
    case "invalid_code":
      return isChinese ? "登入連結已失效或已被使用，請重新申請。" : "That sign-in link has expired or was already used. Request a new one."
    case "not_authorized":
      return isChinese ? "此電郵未獲任何工作台授權。請先解鎖報告，或等待店主邀請。" : "This email is not authorised for any workspace yet. Unlock a report first, or wait for an owner invitation."
    case "auth_unavailable":
      return isChinese ? "登入服務暫時未能使用，請稍後再試。" : "Sign-in is temporarily unavailable. Please try again shortly."
  }
}

/**
 * Real magic-link sign-in in the prototype's auth-page layout (CLAUDE.md §3.1,
 * §5 "Sign-in"). With a `claim` (report slug) the request goes to
 * `POST /api/owner/magic-link`, which mails only when a lead exists on that
 * report; otherwise `POST /api/workspace-invites/magic-link` mails only a
 * pending invitee. Both answer `{ ok: true }` regardless (anti-enumeration),
 * so the UI always moves to "check your inbox". No Google sign-in here: Google
 * is used to *prove ownership* during onboarding, never as an identity.
 */
export function SignInPage({
  locale,
  claim,
  returnTo,
  plan,
  error,
}: {
  locale: PrototypeLocale
  claim?: string
  returnTo?: string
  plan?: string
  error?: SignInErrorCode
}) {
  const isChinese = locale !== "en"
  const planLabel = plan === "multi" ? (isChinese ? "多地點工作台" : "Multi-location") : plan === "growth" ? (isChinese ? "增長工作台" : "Growth Workspace") : null
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle")
  const [formError, setFormError] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setFormError(isChinese ? "請輸入有效的電郵地址。" : "Enter a valid email address.")
      return
    }
    setFormError("")
    setStatus("sending")
    const endpoint = claim ? "/api/owner/magic-link" : "/api/workspace-invites/magic-link"
    const body = claim ? { email: trimmed, slug: claim, locale, returnTo } : { email: trimmed, locale, returnTo }
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (response.ok) {
        setStatus("sent")
        return
      }
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      setStatus("idle")
      if (response.status === 429) setFormError(isChinese ? "請求太頻密，請稍後再試。" : "Too many requests. Please wait a moment and try again.")
      else if (data.error === "invalid_email") setFormError(isChinese ? "請輸入有效的電郵地址。" : "Enter a valid email address.")
      else if (data.error === "invalid_slug") setFormError(isChinese ? "報告連結無效，請由報告頁重新進入。" : "The report reference is invalid. Return from the report page.")
      else setFormError(isChinese ? "暫時未能發送登入電郵，請稍後再試。" : "We could not send the sign-in email. Please try again shortly.")
    } catch {
      setStatus("idle")
      setFormError(isChinese ? "網絡連線失敗，請檢查後再試。" : "Network error. Check your connection and try again.")
    }
  }

  return (
    <PublicPageFrame locale={locale}>
      <main className="auth-page">
        <section className="auth-value"><Badge variant="outline">Visibility Workspace</Badge><h1>{isChinese ? "安全返回需要你決定的業務行動" : "Return securely to the business action that needs you"}</h1><p>{isChinese ? "公開掃描與店主工作台分開。登入後，系統會保留原本的方案、工作台、地點及行動脈絡。" : "Public scanning and the owner workspace stay separate. Sign-in preserves the selected plan, workspace, location and action context."}</p><div className="auth-proof-list"><div><KeyRound /><span><strong>{isChinese ? "以電郵登入連結安全登入" : "Sign in with the magic link we email you"}</strong><small>{isChinese ? "不需要密碼" : "No password to remember"}</small></span></div><div><Building2 /><span><strong>{isChinese ? "工作台與地點範圍" : "Workspace and location scope"}</strong><small>{isChinese ? "每次受保護頁面都重新驗證" : "Re-checked on protected routes"}</small></span></div><div><ShieldCheck /><span><strong>{isChinese ? "按角色限制決定" : "Role-aware decisions"}</strong><small>{isChinese ? "審批與匯出仍需正確權限" : "Approval and export still require the right authority"}</small></span></div></div></section>
        <section className="auth-card">
          {planLabel && <Badge variant="outline">{isChinese ? "已選方案" : "Selected plan"} · {planLabel}</Badge>}
          {claim && <Badge variant="outline">{isChinese ? "認領報告" : "Claiming report"} · {claim}</Badge>}
          <h2>{isChinese ? "店主安全登入" : "Secure owner sign in"}</h2>
          {status === "sent" ? (
            <>
              <p>{isChinese ? "請查看你的收件箱。如果這個電郵已解鎖報告或已獲邀請，登入連結會在數分鐘內送達。" : "Check your inbox. If this email has unlocked a report or holds an invitation, the sign-in link arrives within a few minutes."}</p>
              <div className="onboarding-choice"><span className="onboarding-icon"><Check /></span><div><h3>{email.trim().toLowerCase()}</h3><p>{isChinese ? "連結只可使用一次，並會在短時間內失效。" : "The link works once and expires shortly."}</p></div></div>
              <button className="text-action" type="button" onClick={() => setStatus("idle")}>{isChinese ? "使用另一個電郵" : "Use a different email"}</button>
            </>
          ) : (
            <>
              <p>{isChinese ? "輸入解鎖報告或獲邀請時使用的電郵，我們會寄出一次性的登入連結。工作台成員身份與角色仍由伺服器驗證。" : "Enter the email you used to unlock a report or received an invitation on. We email a one-time sign-in link; workspace membership and role are still verified server-side."}</p>
              {error && <div className="form-error" role="alert"><CircleAlert /> {errorCopy(error, isChinese)}</div>}
              <form onSubmit={submit} noValidate>
                <div className="field-stack">
                  <Label htmlFor="sign-in-email">{isChinese ? "電郵地址" : "Email address"}</Label>
                  <Input id="sign-in-email" name="email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder={isChinese ? "you@example.com" : "you@example.com"} />
                </div>
                {formError && <div className="form-error" role="alert"><CircleAlert /> {formError}</div>}
                <Button type="submit" className="w-full" size="lg" disabled={status === "sending"}><ShieldCheck />{status === "sending" ? (isChinese ? "發送中…" : "Sending…") : (isChinese ? "寄出登入連結" : "Email me a sign-in link")}<ArrowRight /></Button>
              </form>
            </>
          )}
          <div className="auth-divider"><span>{isChinese ? "尚未認領商戶？" : "Haven’t claimed a business?"}</span></div>
          <Button asChild variant="outline" className="w-full"><Link href={`/${locale}/scan`}><ScanSearch />{isChinese ? "先免費掃描" : "Start with a free scan"}</Link></Button>
          <p className="privacy-note"><LockKeyhole />{isChinese ? "登入只識別目前使用者；工作台授權與每項操作權限仍是獨立安全界線。" : "Sign-in identifies the viewer; workspace authorization and mutation permissions remain separate boundaries."}</p>
        </section>
      </main>
    </PublicPageFrame>
  )
}
