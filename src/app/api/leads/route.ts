import { NextRequest, NextResponse } from "next/server";
import { insertLead } from "@/lib/db";
import { saveBusinessCard, saveProductImage } from "@/lib/uploads";
import type { RequestType } from "@/lib/types";

/* Public endpoint the visitor form posts to. No auth — anyone using the
   kiosk PC can submit; only staff (via /admin) can read submissions back. */

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function readJsonArray<T>(formData: FormData, key: string): T[] {
  const raw = formData.get(key);
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const businessCardFile = formData.get("businessCard");
    const businessCardPath =
      businessCardFile instanceof File && businessCardFile.size > 0
        ? await saveBusinessCard(businessCardFile)
        : null;

    const productImageFiles = formData
      .getAll("productImages")
      .filter((f): f is File => f instanceof File && f.size > 0);
    const productImagePaths = await Promise.all(productImageFiles.map(saveProductImage));

    const lead = insertLead({
      name: readString(formData, "name"),
      company: readString(formData, "company"),
      jobTitle: readString(formData, "jobTitle"),
      country: readString(formData, "country"),
      phone: readString(formData, "phone"),
      email: readString(formData, "email"),
      wechat: readString(formData, "wechat"),
      businessCardPath,
      productImagePaths,
      productModels: readJsonArray<string>(formData, "productModels"),
      requestedInformation: readJsonArray<RequestType>(formData, "requestedInformation"),
      message: readString(formData, "message"),
    });

    return NextResponse.json({ ok: true, id: lead.id });
  } catch (err) {
    console.error("Failed to save lead:", err);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
}
