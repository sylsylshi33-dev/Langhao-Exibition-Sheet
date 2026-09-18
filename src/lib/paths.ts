import path from "node:path";

/*
 * Everything the app persists lives under one `data/` folder next to the
 * running server. That makes backup/reset trivial on the exhibition PC:
 * copy the folder to save it, delete it to start fresh.
 */
export const DATA_DIR = path.join(process.cwd(), "data");
export const DB_PATH = path.join(DATA_DIR, "leads.db");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
export const BUSINESS_CARD_DIR = path.join(UPLOADS_DIR, "business-cards");
export const PRODUCT_IMAGE_DIR = path.join(UPLOADS_DIR, "products");
