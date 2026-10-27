// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"

import { copy } from "@/lib/copy"
import { RoleNotice } from "./role-notice"

afterEach(cleanup)

it("says what a viewer can do and who can change it, as a note", () => {
  render(<RoleNotice kind="viewer" locale="en" />)
  const note = screen.getByRole("note")
  expect(note).toHaveTextContent("You can look; ask the owner to make changes.")
  expect(note.querySelectorAll("span")).toHaveLength(1)
  expect(note.querySelector("small")).toBeNull()
  expect(note.querySelector("[data-slot=badge]")).toBeNull()
})

it("fills the role into owner-only notices and marks them Owner only", () => {
  render(<RoleNotice kind="brand" role="manager" locale="zh-HK" />)
  expect(screen.getByRole("note")).toHaveTextContent("經理權限")
  expect(screen.getByRole("note")).toHaveTextContent("只限店主")
})

it("announces a refused request and names the workspace the user could not open", () => {
  render(<RoleNotice kind="notMember" name="kam-man-house" locale="zh-TW" />)
  const alert = screen.getByRole("alert")
  expect(alert).toHaveTextContent("無法開啟「kam-man-house」")
  expect(alert).toHaveTextContent(copy["zh-TW"].shell.access.notMember.hint)
  expect(alert.querySelector("[data-slot=badge]")).toBeNull()
})

it("after a refused page, says the user was brought back to Today", () => {
  render(<RoleNotice kind="forbidden" locale="en" />)
  expect(screen.getByRole("alert")).toHaveTextContent("brought you back to Today")
})

it("points to Team only for a shop outside the manager's scope", () => {
  const { unmount } = render(<RoleNotice kind="outOfScope" locale="en" />)
  expect(screen.getByRole("note")).toHaveTextContent(copy.en.shell.access.askOwner)
  unmount()
  render(<RoleNotice kind="teamManager" role="manager" locale="en" />)
  expect(screen.getByRole("note").querySelector("small")).toBeNull()
})
