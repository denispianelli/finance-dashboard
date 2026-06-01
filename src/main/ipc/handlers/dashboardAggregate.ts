import type { AggregateQuery } from '@shared/types/dashboard';
import type { AggregationBucket } from '@shared/types/taxonomy';
import { getDb } from '../../db';
import { aggregateByCategory } from '../../taxonomy/resolve';

export function handleDashboardAggregate(payload: AggregateQuery): {
  buckets: AggregationBucket[];
} {
  return { buckets: aggregateByCategory(getDb(), payload) };
}
