export type ProductCategory =
  | "smartphone"
  | "perfume"
  | "supplement"
  | "tv"
  | "appliance"
  | "beauty"
  | "general";

export type CategoryAttributeSchema = {
  category: ProductCategory;
  attributes: string[];
  criticalAttributes: string[];
};

export const CATEGORY_ATTRIBUTE_SCHEMAS: Record<ProductCategory, CategoryAttributeSchema> = {
  smartphone: {
    category: "smartphone",
    attributes: ["brand", "model", "storage_gb", "ram_gb", "color", "connectivity", "version", "condition"],
    criticalAttributes: ["storage_gb", "ram_gb", "connectivity", "version", "condition"],
  },
  perfume: {
    category: "perfume",
    attributes: ["brand", "line", "variant", "volume_ml", "concentration", "gender", "product_form", "condition"],
    criticalAttributes: ["product_form", "volume_ml", "concentration", "variant", "condition"],
  },
  supplement: {
    category: "supplement",
    attributes: ["brand", "line", "weight_g", "flavor", "type", "protein_per_serving", "servings", "condition"],
    criticalAttributes: ["weight_g", "flavor", "type", "condition"],
  },
  tv: {
    category: "tv",
    attributes: ["brand", "model", "screen_size_inches", "resolution", "panel_type", "smart_platform", "condition"],
    criticalAttributes: ["screen_size_inches", "resolution", "panel_type", "condition"],
  },
  appliance: {
    category: "appliance",
    attributes: ["brand", "model", "capacity_liters", "capacity", "power_watts", "voltage", "color", "condition"],
    criticalAttributes: ["capacity_liters", "capacity", "power_watts", "voltage", "condition"],
  },
  beauty: {
    category: "beauty",
    attributes: ["brand", "line", "variant", "volume_ml", "weight_g", "color", "product_form", "condition"],
    criticalAttributes: ["product_form", "volume_ml", "weight_g", "variant", "condition"],
  },
  general: {
    category: "general",
    attributes: ["brand", "model", "quantity", "color", "condition"],
    criticalAttributes: ["quantity", "condition"],
  },
};

export function getCategorySchema(category: ProductCategory): CategoryAttributeSchema {
  return CATEGORY_ATTRIBUTE_SCHEMAS[category] ?? CATEGORY_ATTRIBUTE_SCHEMAS.general;
}
