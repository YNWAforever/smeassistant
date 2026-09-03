// Registers the jest-dom matchers (toBeInTheDocument, toHaveAttribute, ...) on
// vitest's `expect`. Loaded for every test file via `test.setupFiles`; the
// matchers only touch the DOM when called, so this is safe under the default
// node environment as well. DOM-based tests must opt into jsdom with a
// `// @vitest-environment jsdom` comment at the top of the file.
import "@testing-library/jest-dom/vitest";
