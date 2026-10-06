/**
 * Select-only view over a Supabase query builder.
 * Callers get a frozen from().select() surface. The service client, its
 * headers, key, rest, auth and rpc stay inside closures and are not exposed.
 */

const BLOCKED = ["insert", "update", "upsert", "delete", "rpc", "headers", "rest", "auth", "url", "method"] as const;

export type QueryError = { message: string };

export type QueryResult<T> = {
  data: T | null;
  error: QueryError | null;
};

export interface ReadonlyFilter<T> extends PromiseLike<QueryResult<T>> {
  eq(column: string, value: string | number | boolean): ReadonlyFilter<T>;
  in(column: string, values: string[]): ReadonlyFilter<T>;
  gt(column: string, value: string): ReadonlyFilter<T>;
  order(column: string, options: { ascending: boolean }): ReadonlyFilter<T>;
  limit(count: number): ReadonlyFilter<T>;
}

export interface ReadonlyClient {
  from(table: string): {
    select(columns: string): ReadonlyFilter<unknown[]>;
  };
}

type RawQuery = {
  eq: (column: string, value: string | number | boolean) => RawQuery;
  in: (column: string, values: string[]) => RawQuery;
  gt: (column: string, value: string) => RawQuery;
  order: (column: string, options: { ascending: boolean }) => RawQuery;
  limit: (count: number) => RawQuery;
  then: (
    onFulfilled?: ((value: QueryResult<unknown[]>) => unknown) | null,
    onRejected?: ((reason: unknown) => unknown) | null,
  ) => unknown;
};

type RawSelect = {
  from: (table: string) => {
    select: (columns: string) => RawQuery;
  };
};

function wrap(query: RawQuery): ReadonlyFilter<unknown[]> {
  const filter: ReadonlyFilter<unknown[]> = {
    eq(column, value) {
      return wrap(query.eq(column, value));
    },
    in(column, values) {
      return wrap(query.in(column, values));
    },
    gt(column, value) {
      return wrap(query.gt(column, value));
    },
    order(column, options) {
      return wrap(query.order(column, options));
    },
    limit(count) {
      return wrap(query.limit(count));
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve(query).then(onFulfilled, onRejected);
    },
  };
  return Object.freeze(filter);
}

export function createReadonlyClient(raw: RawSelect): ReadonlyClient {
  const from = (table: string) => {
    const select = (columns: string) => wrap(raw.from(table).select(columns));
    return Object.freeze({ select });
  };
  const client = Object.freeze({ from });
  for (const key of BLOCKED) {
    if (key in client) {
      throw new Error("leak scan client is select-only");
    }
  }
  return client;
}
