const CATEGORY_ICONS: Record<string, string> = {
  Agro: "🌾",
  Fitness: "🏋️",
};

const DEFAULT_ICON = "🎁";

export function getCategoryIcon(category: string): string {
  return CATEGORY_ICONS[category] ?? DEFAULT_ICON;
}
