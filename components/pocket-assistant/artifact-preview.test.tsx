// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { AssistantArtifactPreview } from "./artifact-preview";
import type { AssistantArtifact } from "@/lib/pocket-assistant/contracts";

afterEach(cleanup);

it.each([
  { locale: "en" as const, version: 1, label: "Draft preview" },
  { locale: "zh-HK" as const, version: 7, label: "草稿預覽" },
])("does not present an unsaved preview counter as a stored version: $label", ({ locale, version, label }) => {
  const artifact: AssistantArtifact = {
    type: "review_reply",
    artifactId: "example-preview",
    version,
    title: "Example review reply",
    body: "Thank you for the rating.",
    acceptanceCriteria: ["Owner approval is still required."],
  };

  render(<AssistantArtifactPreview artifact={artifact} locale={locale} />);

  expect(screen.getByText(label, { exact: true })).toBeInTheDocument();
  expect(screen.queryByText(`v${version}`, { exact: true })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: artifact.title })).toBeInTheDocument();
  expect(screen.getByText(artifact.body)).toBeInTheDocument();
  expect(screen.getByText("Owner approval is still required.")).toBeInTheDocument();
});
