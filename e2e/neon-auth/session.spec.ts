import {test,expect,type Page} from '@playwright/test';
import {hostedAuthTarget} from '../../test/e2e/hosted-auth-target';
const target=hostedAuthTarget(process.env);
/** Inbox is a separately authorized mailbox adapter returning {recipient,url,receivedAt}.
 * No hosted target or recipient has been selected in this migration. This suite is NOT RUN.
 */
async function deliveredLink(page:Page){
 const since=new Date().toISOString();await page.goto('/en/owner/sign-in');await page.locator('#sign-in-email').fill(target.recipient);await page.locator('form button[type=submit]').click();
 let link='';await expect(async()=>{const response=await page.request.get(target.inbox,{headers:{authorization:`Bearer ${process.env.NEON_AUTH_TEST_INBOX_TOKEN ?? ''}`},params:{recipient:target.recipient,since}});expect(response.ok()).toBe(true);const body=await response.json();expect(body.recipient).toBe(target.recipient);expect(Date.parse(body.receivedAt)).toBeGreaterThanOrEqual(Date.parse(since));link=body.url;expect([target.origin,target.provider]).toContain(new URL(link).origin);expect(new URL(link).username).toBe('');expect(new URL(link).password).toBe('');}).toPass({timeout:60000});return link;
}
test('managed mail delivery/redemption, logout, session invalidation and replay rejection',async({page,browser})=>{
 const link=await deliveredLink(page);await page.goto(link);await expect(page).toHaveURL(/\/en\/owner\/(?!sign-in)/);
 const retained=await page.context().storageState();const response=await page.request.post('/api/auth/sign-out');expect(response.ok()).toBe(true);
 const stale=await browser.newContext({storageState:retained});try{const tab=await stale.newPage();await tab.goto(`${target.origin}/en/owner/select-workspace`);await expect(tab).toHaveURL(/owner\/sign-in/);}finally{await stale.close();}
 await page.goto(link);await expect(page).toHaveURL(/error=|owner\/sign-in/);await page.goto('/en/owner/select-workspace');await expect(page).toHaveURL(/owner\/sign-in/);
});
test('managed expiry rejects a delivered link after the configured provider lifetime',async({page})=>{
 test.setTimeout(target.linkTtlMs+120000);
 const link=await deliveredLink(page);await page.waitForTimeout(target.linkTtlMs+1000);
 await page.goto(link);await expect(page).toHaveURL(/error=|owner\/sign-in/);
 await page.goto('/en/owner/select-workspace');await expect(page).toHaveURL(/owner\/sign-in/);
});
test('safe callbacks reject off-origin magic-link and Google destinations',async({request})=>{for(const path of ['magic-link','social']){const result=await request.post(`/api/auth/sign-in/${path}`,{data:{email:target.recipient,provider:'google',callbackURL:'https://outside.example.test/auth/callback'}});expect(result.status()).toBe(400);}});
test('Google account selection and actual consent returns a managed session',async({browser})=>{
 const context=await browser.newContext({storageState:target.googleState});try{
  const page=await context.newPage();await page.goto(`${target.origin}/en/owner/sign-in`);await page.getByRole('button',{name:/Google/}).click();
  await expect(page).toHaveURL(/https:\/\/accounts\.google\.com\//);
  await page.getByText(target.googleEmail,{exact:true}).click();
  // Requires the dedicated authorized account to show a real consent screen.
  await expect(page.getByText(/wants access|wants to access|Sign in to/i).first()).toBeVisible();
  await page.getByRole('button',{name:/Continue|Allow/,exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`^${target.origin.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}/en/owner/(?!sign-in)`));
  const logout=await page.request.post(`${target.origin}/api/auth/sign-out`);expect(logout.ok()).toBe(true);
 }finally{await context.close();}
});
