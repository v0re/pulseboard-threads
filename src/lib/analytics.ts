import type { MetricValue, PostMetrics } from "./types";

export function sumKnown(values: MetricValue[]): MetricValue {
  const known = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

export function interactionTotal(metrics: PostMetrics): MetricValue {
  return sumKnown([metrics.likes, metrics.replies, metrics.reposts, metrics.quotes]);
}

export function engagementRate(metrics: PostMetrics): number | null {
  const interactions = interactionTotal(metrics);
  if (metrics.views === null || metrics.views <= 0 || interactions === null) return null;
  return (interactions / metrics.views) * 100;
}

export function percentChange(current: MetricValue, previous: MetricValue): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function formatMetric(value: MetricValue): string {
  return value === null ? "無資料" : new Intl.NumberFormat("zh-TW").format(value);
}

export function formatPercent(value: number | null, digits = 1): string {
  return value === null || !Number.isFinite(value) ? "無資料" : `${value.toFixed(digits)}%`;
}
