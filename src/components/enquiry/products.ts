import type { ProductDraft } from "@/lib/types";
import { newClientId } from "./upload";

export function newProduct(): ProductDraft {
  return { id: newClientId(), sku: "", colour: "", quantity: "", packaging: "", photos: [] };
}

/** Nothing entered at all: an untouched row that is simply dropped on Next/submit. */
export function isBlankProduct(p: ProductDraft): boolean {
  return (
    p.photos.length === 0 &&
    !p.sku.trim() &&
    !p.colour.trim() &&
    !p.quantity.trim() &&
    !p.packaging.trim()
  );
}

/** A product needs a photo or a SKU (or both). */
export function productHasPhotoOrSku(p: ProductDraft): boolean {
  return p.photos.length > 0 || p.sku.trim() !== "";
}

/** Products that will be sent: blank rows removed. */
export function submittableProducts(products: ProductDraft[]): ProductDraft[] {
  return products.filter((p) => !isBlankProduct(p));
}

export function firstInvalidProductId(products: ProductDraft[]): string | null {
  return submittableProducts(products).find((p) => !productHasPhotoOrSku(p))?.id ?? null;
}
