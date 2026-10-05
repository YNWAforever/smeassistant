// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HydrationMarker } from "./hydration-marker";

describe("HydrationMarker", () => {
  afterEach(() => {
    delete document.documentElement.dataset.hydrated;
  });

  it("marks <html> once React has taken over the page", () => {
    expect(document.documentElement.dataset.hydrated).toBeUndefined();
    const { container } = render(<HydrationMarker />);
    expect(document.documentElement.dataset.hydrated).toBe("true");
    expect(container.innerHTML).toBe("");
  });
});
