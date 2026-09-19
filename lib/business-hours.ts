// Os fornecedores só devem ser consultados em horário comercial.
// Ajuste os limites abaixo se algum fornecedor confirmar uma janela diferente.

const BUSINESS_START_HOUR = 8;
const BUSINESS_END_HOUR = 18; // exclusivo: até 17:59
const TIMEZONE = "America/Sao_Paulo";

export interface BusinessHoursCheck {
  isBusinessHours: boolean;
  weekday: number; // 0 = domingo .. 6 = sábado
  hour: number;
  timezone: string;
}

/**
 * Verifica se o horário atual (ou informado) está dentro do expediente
 * comercial brasileiro: segunda a sexta, 08:00–18:00, horário de Brasília.
 */
export function checkBusinessHours(date: Date = new Date()): BusinessHoursCheck {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);

  const weekdayShort = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdayMap[weekdayShort] ?? 0;

  const isWeekday = weekday >= 1 && weekday <= 5;
  const isWithinWindow = hour >= BUSINESS_START_HOUR && hour < BUSINESS_END_HOUR;

  return {
    isBusinessHours: isWeekday && isWithinWindow,
    weekday,
    hour,
    timezone: TIMEZONE,
  };
}
