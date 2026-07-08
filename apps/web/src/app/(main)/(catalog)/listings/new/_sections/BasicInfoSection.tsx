/** @format */

"use client";

import { Input, Textarea } from "@tarodan/ui";
import { FormSection } from "./FormSection";
import { useNewListing } from "../_context/NewListingContext";

export default function BasicInfoSection() {
  const { formData, setFormData } = useNewListing();
  return (
    <FormSection title="Temel Bilgiler">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-body mb-1.5">
            Başlık <span className="text-danger-500">*</span>
          </label>
          <Input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="px-4 py-2.5 border-border rounded text-heading placeholder-subtle"
            placeholder="Örn: Hot Wheels '69 Camaro Z28"
            required
            minLength={5}
            maxLength={200}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-body mb-1.5">
            Açıklama
          </label>
          <Textarea
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            className="px-4 py-2.5 border-border rounded text-heading placeholder-subtle"
            placeholder="Ürün hakkında detaylı bilgi..."
            rows={4}
            maxLength={5000}
          />
        </div>
      </div>
    </FormSection>
  );
}
