import path from "node:path";
import { dataDir } from "./config";

/* All persistent files live under dataDir() — see ./config.ts. */
export const dbFilePath = () => path.join(dataDir(), "leads.db");
export const uploadsDir = () => path.join(dataDir(), "uploads");
export const businessCardDir = () => path.join(uploadsDir(), "business-cards");
export const productImageDir = () => path.join(uploadsDir(), "products");
