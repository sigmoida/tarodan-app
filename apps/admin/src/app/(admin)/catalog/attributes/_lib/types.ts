export interface AttributeGroup {
  id: string;
  name: string;
  slug: string;
  description?: string;
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
  attributeCount?: number;
  manufacturerSlug?: string | null;
}

export interface Attribute {
  id: string;
  groupId: string;
  value: string;
  slug: string;
  displayValue?: string;
  color?: string;
  sortOrder: number;
  isActive: boolean;
}
