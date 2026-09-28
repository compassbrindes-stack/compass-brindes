const CATEGORY_ICONS: Record<string, string> = {
  Agro: "🌾",
  Bolsas: "👜",
  "Bolsas Térmicas": "🧊",
  Canetas: "🖊️",
  Canivetes: "🔪",
  Chaveiros: "🔑",
  Copos: "🥤",
  Diversos: "✨",
  Eletrônicos: "🎧",
  Fitness: "🏋️",
  "Garrafa Térmica": "🧉",
  "Garrafa inox": "🍶",
  "Kit Churrasco": "🥩",
  Mochilas: "🎒",
  Necessaires: "👝",
  Térmico: "☕",
};

const DEFAULT_ICON = "🎁";

export function getCategoryIcon(category: string): string {
  return CATEGORY_ICONS[category] ?? DEFAULT_ICON;
}
