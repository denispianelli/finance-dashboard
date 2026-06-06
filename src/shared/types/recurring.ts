/** A transaction reduced to what recurrence detection needs. `date` is `yyyy-mm-dd`. */
export interface RecurringInput {
  readonly date: string;
  readonly amount: number;
  readonly label: string;
}

export type RecurringCadence = 'monthly' | 'annual';

/** A detected recurring expense / subscription. `amount` is a positive magnitude. */
export interface RecurringSubscription {
  readonly label: string;
  readonly amount: number;
  readonly cadence: RecurringCadence;
  readonly monthlyEquivalent: number;
  readonly occurrences: number;
  readonly lastDate: string;
  readonly nextDueDate: string;
}

/** The recurring report: detected subscriptions + their combined monthly cost. */
export interface RecurringReport {
  readonly subscriptions: RecurringSubscription[];
  readonly monthlyTotal: number;
}
