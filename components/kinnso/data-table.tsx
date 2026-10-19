import type { ReactNode } from "react"

import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { copy, type PrototypeLocale } from "@/lib/copy"

export type DataColumn<Row> = { key: string; header: string; cell: (row: Row) => ReactNode; numeric?: boolean }

/** Accessible table: a caption is required; wide tables scroll inside a focusable region. */
export function DataTable<Row>({ caption, columns, rows, rowKey, empty, locale }: { caption: string; columns: DataColumn<Row>[]; rows: Row[]; rowKey: (row: Row) => string; empty?: string; locale: PrototypeLocale }) {
  return (
    <div className="kinnso-table overflow-x-auto" tabIndex={0} role="region" aria-label={caption}>
      <Table>
        <TableCaption>{caption}</TableCaption>
        <TableHeader>
          <TableRow>{columns.map((column) => <TableHead key={column.key} className={column.numeric ? "text-right" : undefined}>{column.header}</TableHead>)}</TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow><TableCell colSpan={columns.length} className="py-8 text-center text-ink-3">{empty ?? copy[locale].ui.table.empty}</TableCell></TableRow>
          ) : rows.map((row) => (
            <TableRow key={rowKey(row)}>
              {columns.map((column) => <TableCell key={column.key} className={column.numeric ? "text-right tabular-nums" : undefined}>{column.cell(row)}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
