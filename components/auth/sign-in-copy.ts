import type { Locale } from "@/lib/locale";

export type SignInCopy = {
  title: string;
  privacy: string;
  google: string;
  openingGoogle: string;
  emailAlternative: string;
  emailLabel: string;
  emailAction: string;
  sendingEmail: string;
  emailIntro: string;
  claimEmailIntro: string;
  inbox: string;
  claimInbox: string;
  /**
   * Shown beneath the inbox status. Both mail routes answer uniformly whether
   * or not a link was sent, so the page cannot report eligibility -- it can
   * only state the precondition and point at the other entry point. Naming the
   * rule is safe; naming whether THIS address met it would be the enumeration
   * leak the uniform response exists to prevent.
   */
  noLinkHelp: string;
  claimNoLinkHelp: string;
  changeEmail: string;
  resend: string;
  resendIn: (seconds: number) => string;
  cancelled: string;
  expired: string;
  unavailable: string;
  retryGoogle: string;
  retryEmail: string;
  noAccess: string;
  changeAccount: string;
  changingAccount: string;
  changeAccountFailed: string;
  processing: string;
  technicalFailure: string;
  completionFailedGoogle: string;
  completionFailedEmail: string;
  restartGoogle: string;
  restartEmail: string;
  restartSignIn: string;
  invalidEmail: string;
};

const en: SignInCopy = {
  title: "Sign in to your workspace",
  privacy: "We use your sign-in only to identify you. Workspace access and actions are checked separately.",
  google: "Continue with Google",
  openingGoogle: "Opening Google…",
  emailAlternative: "Or use email instead",
  emailLabel: "Email address",
  emailAction: "Email me a sign-in link",
  sendingEmail: "Sending sign-in link…",
  emailIntro: "Use the email for your current workspace membership or invitation.",
  claimEmailIntro: "Use the email that unlocked this report. Workspace access is still checked separately.",
  inbox: "Check your inbox. If the address is eligible, a one-time sign-in link will arrive shortly.",
  claimInbox: "Check your inbox. If this address unlocked the report, a one-time sign-in link will arrive shortly.",
  noLinkHelp: "No link? Sign-in links only reach an address that is already a workspace member or has a pending invitation. If you started from a report, open that report and use the sign-in link there instead.",
  claimNoLinkHelp: "No link? Sign-in links only reach the address that unlocked this report. If you used a different address, unlock the report again with the one you want to sign in with.",
  changeEmail: "Use a different email",
  resend: "Send another link",
  resendIn: (seconds) => `Send another link in ${seconds}s`,
  cancelled: "Google sign-in was cancelled.",
  expired: "That sign-in link has expired or was already used.",
  unavailable: "Sign-in is temporarily unavailable. Please try again shortly.",
  retryGoogle: "Try Google again",
  retryEmail: "Try email instead",
  noAccess: "This account does not have access to a workspace yet.",
  changeAccount: "Change account",
  changingAccount: "Changing account…",
  changeAccountFailed: "We could not change the account. Please try again.",
  processing: "Checking your workspace access…",
  technicalFailure: "We could not finish sign-in. Start a new sign-in attempt.",
  completionFailedGoogle: "We could not finish Google sign-in. Start a new Google sign-in attempt.",
  completionFailedEmail: "We could not finish email sign-in. Start a new email sign-in attempt.",
  restartGoogle: "Start Google sign-in again",
  restartEmail: "Start email sign-in again",
  restartSignIn: "Start sign-in again",
  invalidEmail: "Enter a valid email address.",
};

const zhHK: SignInCopy = {
  title: "登入你的工作台",
  privacy: "登入只用於識別你；工作台存取和每項操作仍會獨立核實。",
  google: "使用 Google 繼續",
  openingGoogle: "正在開啟 Google…",
  emailAlternative: "或改用電郵",
  emailLabel: "電郵地址",
  emailAction: "寄出登入連結",
  sendingEmail: "正在寄出登入連結…",
  emailIntro: "使用現有工作台成員身分或邀請所用的電郵。",
  claimEmailIntro: "使用解鎖此報告時的電郵；工作台存取仍會獨立核實。",
  inbox: "請查看收件箱。如該地址符合資格，一次性登入連結會在短時間內送達。",
  claimInbox: "請查看收件箱。如該地址曾解鎖此報告，一次性登入連結會在短時間內送達。",
  noLinkHelp: "收不到連結？登入連結只會寄給已是工作台成員或已獲邀請的電郵地址。如果你是從報告開始的，請開啟該報告，改用報告中的登入連結。",
  claimNoLinkHelp: "收不到連結？登入連結只會寄給曾解鎖此報告的電郵地址。如果你當時用了另一個地址，請用你想登入的地址再解鎖一次報告。",
  changeEmail: "使用另一個電郵",
  resend: "再寄一次連結",
  resendIn: (seconds) => `${seconds} 秒後可再寄一次連結`,
  cancelled: "已取消 Google 登入。",
  expired: "登入連結已過期或已被使用。",
  unavailable: "登入服務暫時未能使用，請稍後再試。",
  retryGoogle: "再試一次 Google",
  retryEmail: "改用電郵",
  noAccess: "此帳戶目前未有工作台存取權。",
  changeAccount: "更換帳戶",
  changingAccount: "正在更換帳戶…",
  changeAccountFailed: "未能更換帳戶，請再試一次。",
  processing: "正在核實你的工作台存取權…",
  technicalFailure: "未能完成登入，請重新開始登入。",
  completionFailedGoogle: "未能完成 Google 登入，請重新開始 Google 登入。",
  completionFailedEmail: "未能完成電郵登入，請重新開始電郵登入。",
  restartGoogle: "重新開始 Google 登入",
  restartEmail: "重新開始電郵登入",
  restartSignIn: "重新開始登入",
  invalidEmail: "請輸入有效的電郵地址。",
};

/**
 * Written out in full rather than spread from zh-HK. This locale was
 * `{ ...zhHK }`, which silently shipped Hong Kong register to every Taiwan
 * reader on this surface -- and a spread makes that the default outcome for any
 * key added later, which is exactly how it happened. Taiwan register per
 * CLAUDE.md §5 and the split already pinned in lib/copy-workspace.ts:
 * 您 not 你, 查證 not 核實, 電子郵件 not 電郵, 收件匣 not 收件箱, 無法 not 未能.
 */
const zhTW: SignInCopy = {
  title: "登入您的工作台",
  privacy: "登入只用於識別您；工作台存取和每項操作仍會獨立查證。",
  google: "使用 Google 繼續",
  openingGoogle: "正在開啟 Google…",
  emailAlternative: "或改用電子郵件",
  emailLabel: "電子郵件地址",
  emailAction: "寄送登入連結",
  sendingEmail: "正在寄送登入連結…",
  emailIntro: "請使用現有工作台成員身分或邀請所使用的電子郵件。",
  claimEmailIntro: "請使用解鎖此報告時的電子郵件；工作台存取仍會獨立查證。",
  inbox: "請查看收件匣。如該地址符合資格，一次性登入連結會在短時間內送達。",
  claimInbox: "請查看收件匣。如該地址曾解鎖此報告，一次性登入連結會在短時間內送達。",
  noLinkHelp: "收不到連結？登入連結只會寄給已是工作台成員或已獲邀請的電子郵件地址。如果您是從報告開始的，請開啟該報告，改用報告中的登入連結。",
  claimNoLinkHelp: "收不到連結？登入連結只會寄給曾解鎖此報告的電子郵件地址。如果您當時使用了另一個地址，請用您想登入的地址再解鎖一次報告。",
  changeEmail: "使用其他電子郵件",
  resend: "再寄一次連結",
  resendIn: (seconds) => `${seconds} 秒後可再寄一次連結`,
  cancelled: "已取消 Google 登入。",
  expired: "登入連結已過期或已被使用。",
  unavailable: "登入服務暫時無法使用，請稍後再試。",
  retryGoogle: "再試一次 Google",
  retryEmail: "改用電子郵件",
  noAccess: "此帳號目前沒有工作台存取權。",
  changeAccount: "更換帳號",
  changingAccount: "正在更換帳號…",
  changeAccountFailed: "無法更換帳號，請再試一次。",
  processing: "正在查證您的工作台存取權…",
  technicalFailure: "無法完成登入，請重新開始登入。",
  completionFailedGoogle: "無法完成 Google 登入，請重新開始 Google 登入。",
  completionFailedEmail: "無法完成電子郵件登入，請重新開始電子郵件登入。",
  restartGoogle: "重新開始 Google 登入",
  restartEmail: "重新開始電子郵件登入",
  restartSignIn: "重新開始登入",
  invalidEmail: "請輸入有效的電子郵件地址。",
};

export const signInCopy: Record<Locale, SignInCopy> = {
  en,
  "zh-HK": zhHK,
  "zh-TW": zhTW,
};