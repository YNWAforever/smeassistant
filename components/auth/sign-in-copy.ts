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

const zhTW: SignInCopy = { ...zhHK };

export const signInCopy: Record<Locale, SignInCopy> = {
  en,
  "zh-HK": zhHK,
  "zh-TW": zhTW,
};