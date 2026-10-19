/** Offline navigation transport only. Product components and client helpers remain real. */
import { forwardRef, type AnchorHTMLAttributes } from "react";
type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean; scroll?: boolean; replace?: boolean };
const Link = forwardRef<HTMLAnchorElement, Props>(function FixtureLink({ prefetch, scroll, replace, ...props }, ref) {
  void prefetch; void scroll; void replace;
  return <a {...props} ref={ref} />;
});
export default Link;
const router = {
  push: (href: string) => window.location.assign(href),
  replace: (href: string) => window.location.replace(href),
  refresh: () => window.dispatchEvent(new Event("fixture:refresh")),
  prefetch: () => undefined,
  back: () => window.history.back(),
  forward: () => window.history.forward(),
};
export const useRouter = () => router;
export const usePathname = () => window.location.pathname;
export const useSearchParams = () => new URLSearchParams(window.location.search);
export const useParams = () => ({ locale: window.location.pathname.split("/")[1], workspaceSlug: "test-shop" });
