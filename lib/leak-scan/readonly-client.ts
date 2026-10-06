/**
 * Select-only view over a Supabase query builder.
 * The scan modules receive this type and cannot call insert, update, upsert, delete or rpc.
 */

const BLOCKED = new Set(["insert", "update", "upsert", "delete", "rpc"]);

export type QueryError = { message: string };

export type QueryResult<T> = {
  data: T | null;
  error: QueryError | null;
};

export interface ReadonlyFilter<T> extends PromiseLike<QueryResult<T>> {
  eq(column: string, value: string | number | boolean): ReadonlyFilter<T>;
  order(column: string, options: { ascending: boolean }): ReadonlyFilter<T>;
  limit(count: number): ReadonlyFilter<T>;
}

export interface ReadonlyClient {
  from(table: string): {
    select(columns: string): ReadonlyFilter<unknown[]>;
  };
}

type RawSelect = {
  from: (table: string) => {
    select: (columns: string) => unknown;
  };
};

function seal<T>(query: unknown): ReadonlyFilter<T> {
  if (!query || typeof query !== "object") {
    throw new Error("leak scan select returned no query");
  }
  return new Proxy(query, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && BLOCKED.has(prop)) {
        return () => {
          throw new Error("leak scan client is select-only");
        };
      }
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") {
        return value;
      }
      return (...args: unknown[]) => {
        const next = (value as (...inner: unknown[]) => unknown).apply(target, args);
        if (next && typeof next === "object" && prop !== "then") {
          return seal(next);
        }
        return next;
      };
    },
  }) as ReadonlyFilter<T>;
}

export function createReadonlyClient(raw: RawSelect): ReadonlyClient {
  return {
    from(table: string) {
      const builder = raw.from(table);
      const view = {
        select(columns: string) {
          return seal<unknown[]>(builder.select(columns));
        },
      };
      return new Proxy(view, {
        get(target, prop, receiver) {
          if (typeof prop === "string" && BLOCKED.has(prop)) {
            return () => {
              throw new Error("leak scan client is select-only");
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      });
    },
  };
}
