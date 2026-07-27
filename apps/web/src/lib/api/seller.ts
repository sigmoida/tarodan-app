import { api } from "./client";

export type SellerDocumentType =
  | "tax_plate"
  | "contract"
  | "signature_circular"
  | "activity_certificate"
  | "identity";

export interface SellerDocumentSlot {
  documentType: SellerDocumentType;
  uploaded: boolean;
  fileName?: string;
  mimeType?: string;
  status?: "pending" | "approved" | "rejected";
  reviewNote?: string | null;
  uploadedAt?: string;
  url?: string;
}

/** Corporate seller application documents (upload/list). */
export const sellerApi = {
  getDocuments: () =>
    api.get<{ documents: SellerDocumentSlot[] }>("/users/me/seller-documents"),
  uploadDocument: (documentType: SellerDocumentType, file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("documentType", documentType);
    return api.post("/users/me/seller-documents", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};
