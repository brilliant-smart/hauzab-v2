import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable, type Column } from "@/components/DataTable";
import { renderWithProviders } from "@/test/setup";

interface Row {
  id: number;
  name: string;
}

const columns: Column<Row>[] = [
  { key: "name", header: "Name", cell: (r) => r.name },
];
const rows: Row[] = [
  { id: 1, name: "Soda" },
  { id: 2, name: "Bread" },
];

describe("DataTable", () => {
  it("renders skeleton rows while loading", () => {
    renderWithProviders(
      <DataTable columns={columns} data={[]} loading rowKey={(r) => r.id} />,
    );
    // Header row + 5 skeleton rows.
    expect(screen.getAllByRole("row")).toHaveLength(6);
    expect(screen.queryByText("Soda")).not.toBeInTheDocument();
  });

  it("renders the empty message when there is no data", () => {
    renderWithProviders(
      <DataTable columns={columns} data={[]} rowKey={(r) => r.id} emptyMessage="Nothing here." />,
    );
    expect(screen.getByText("Nothing here.")).toBeInTheDocument();
  });

  it("renders rows through the cell accessor", () => {
    renderWithProviders(<DataTable columns={columns} data={rows} rowKey={(r) => r.id} />);
    expect(screen.getByText("Soda")).toBeInTheDocument();
    expect(screen.getByText("Bread")).toBeInTheDocument();
  });

  it("shows a retry control on error and invokes onRetry", async () => {
    const onRetry = vi.fn();
    renderWithProviders(
      <DataTable columns={columns} data={[]} error onRetry={onRetry} rowKey={(r) => r.id} />,
    );
    expect(screen.getByText("Couldn't load this data.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("paginates and calls onPageChange with the adjacent page", async () => {
    const onPageChange = vi.fn();
    renderWithProviders(
      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        page={2}
        lastPage={3}
        total={9}
        from={4}
        to={6}
        onPageChange={onPageChange}
      />,
    );
    expect(screen.getByText(/Showing 4–6 of 9/)).toBeInTheDocument();
    // Numbered page buttons render; the current page (2) is shown as a button.
    expect(screen.getByRole("button", { name: "2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);

    await userEvent.click(screen.getByRole("button", { name: /prev/i }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
  });

  it("disables Prev on the first page and Next on the last page", () => {
    renderWithProviders(
      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        page={1}
        lastPage={1}
        total={2}
        from={1}
        to={2}
        onPageChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /prev/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });
});