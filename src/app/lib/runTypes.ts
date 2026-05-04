export const RUN_TYPES = [
  { key: "jogging",   label: "조깅",     desc: "가볍게 뛰는 저강도 러닝" },
  { key: "running",   label: "러닝",     desc: "일반적인 야외 러닝" },
  { key: "interval",  label: "인터벌",   desc: "빠르게/느리게 반복하는 고강도" },
  { key: "long",      label: "롱런",     desc: "장거리 러닝 (지구력)" },
  { key: "tempo",     label: "템포런",   desc: "일정한 빠른 페이스 유지" },
  { key: "recovery",  label: "회복런",   desc: "피로 회복용 매우 느린 러닝" },
  { key: "treadmill", label: "트레드밀", desc: "실내 러닝머신" },
  { key: "race",      label: "레이스",   desc: "대회 참가 기록" },
] as const;

export type RunTypeKey = typeof RUN_TYPES[number]["key"];

export const RUN_TYPE_KEYS = RUN_TYPES.map((t) => t.key) as readonly RunTypeKey[];

const LEGACY_LABEL_TO_KEY: Record<string, RunTypeKey> = {
  "조깅": "jogging",
  "런닝": "running",
  "러닝": "running",
  "인터벌": "interval",
  "롱런": "long",
  "템포런": "tempo",
  "회복런": "recovery",
  "트레드밀": "treadmill",
  "레이스": "race",
};

export function normalizeRunType(value: unknown): RunTypeKey {
  const v = String(value ?? "").trim();
  if ((RUN_TYPE_KEYS as readonly string[]).includes(v)) return v as RunTypeKey;
  return LEGACY_LABEL_TO_KEY[v] ?? "running";
}

export function runTypeLabel(value: unknown): string {
  const key = normalizeRunType(value);
  return RUN_TYPES.find((t) => t.key === key)!.label;
}
