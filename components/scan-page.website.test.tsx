// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Children, type ReactElement, type ReactNode } from "react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/product-ui", () => ({ PublicPageFrame: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: ReactNode }) => {
    const [trigger, content] = Children.toArray(children) as ReactElement<{ id?: string; children?: ReactNode }>[];
    return <select id={trigger.props.id} value={value} onChange={event => onValueChange(event.target.value)}><option value="" />{content}</select>;
  },
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => children,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));
import { ScanPage } from "./scan-page";
import { copy } from "@/lib/copy";
import { t } from "@/lib/i18n";
import { interpolate } from "@/lib/share";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it.each(["en", "zh-HK", "zh-TW"] as const)("keeps malformed website out of preview and allows blank correction: %s", locale => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const c = copy[locale].funnel.scan;
  render(<ScanPage locale={locale} initialMarket="hk" initialBusiness="Fixture Cafe" consentPolicyVersion="fixture-policy" />);
  fireEvent.click(screen.getByRole("button", { name: c.manualEntry }));
  fireEvent.click(screen.getByRole("button", { name: c.continue }));
  const industry = screen.getByLabelText(t(locale, "scanner.industryLabel")) as HTMLSelectElement;
  const district = screen.getByLabelText(t(locale, "scanner.districtLabel")) as HTMLSelectElement;
  fireEvent.change(industry, { target: { value: industry.options[1].value } });
  fireEvent.change(district, { target: { value: district.options[1].value } });
  fireEvent.click(screen.getByRole("button", { name: c.continue }));
  const website = screen.getByLabelText(new RegExp(c.websiteLabel));
  fireEvent.change(website, { target: { value: "not-a-url" } });
  fireEvent.click(screen.getByRole("button", { name: c.continue }));
  expect(website).toHaveAttribute("aria-invalid", "true");
  expect(website).toHaveAccessibleDescription(c.errors.website);
  expect(website).toHaveFocus();
  expect(screen.getByText(interpolate(c.coverageRequested, { count: 1 }))).toBeTruthy();
  expect(screen.queryByRole("button", { name: c.start })).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.change(website, { target: { value: "  " } });
  expect(screen.getAllByText(new RegExp(c.sourceNotProvided)).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: c.continue }));
  expect(screen.getByRole("button", { name: c.start })).toBeTruthy();
});
