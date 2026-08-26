import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/setup";

const { useParamsMock } = vi.hoisted(() => ({ useParamsMock: vi.fn(() => ({})) }));

// Spread the real module so MemoryRouter / useNavigate survive; only useParams
// is overridden so we can drive create vs edit without a route table.
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useParams: useParamsMock };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/app/api/catalog", () => ({
  useProduct: vi.fn(() => ({ data: undefined })),
  useLookupList: vi.fn(() => ({
    data: [
      { id: 1, name: "Pieces" },
      { id: 2, name: "Carton" },
    ],
  })),
  useSaveProduct: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useUploadProductImage: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

import ProductForm from "@/app/pages/products/ProductForm";
import { useProduct } from "@/app/api/catalog";

beforeEach(() => {
  useParamsMock.mockReturnValue({});
  vi.mocked(useProduct).mockReturnValue({ data: undefined } as never);
});

// The required-asterisk lives in a child <span>, so getByText can't match the
// whole label with a regex (the text is broken up across elements). A function
// matcher receives the label's direct text and matches it exactly — "Unit" and
// "Unit Cost Price" are distinct direct-text values, so the exact check is safe.
const labelIs = (text: string) => (content: string) => content.trim() === text;

describe("ProductForm", () => {
  it("renders Unit and Category dropdowns", () => {
    renderWithProviders(<ProductForm />);

    expect(screen.getByText(labelIs("Unit"))).toBeInTheDocument();
    expect(screen.getByText(labelIs("Category"))).toBeInTheDocument();
  });

  it("shows the opening quantity field on create", () => {
    renderWithProviders(<ProductForm />);

    expect(screen.getByText(/Opening Quantity/i)).toBeInTheDocument();
  });

  it("hides the quantity field on edit but keeps Unit and Category", () => {
    useParamsMock.mockReturnValue({ id: "1" });
    vi.mocked(useProduct).mockReturnValue({
      data: {
        id: 1,
        name: "Coke 60cl",
        quantity: "12",
        cost_price: "50",
        selling_price: "80",
        unit_id: 1,
        category_id: 1,
        reorder_level: 5,
      },
    } as never);

    renderWithProviders(<ProductForm />);

    expect(screen.queryByText(/Opening Quantity/i)).not.toBeInTheDocument();
    // Unit + Category remain available for attribute edits on edit.
    expect(screen.getByText(labelIs("Unit"))).toBeInTheDocument();
    expect(screen.getByText(labelIs("Category"))).toBeInTheDocument();
  });
});