export type MetricName =
  | "open"
  | "schema"
  | "insert xN"
  | "select-all"
  | "select-lookup"
  | "update xN"
  | "delete xN";

export type BenchResult = {
  implementation: string;
  packageVersion?: string;
  engineVersion?: string;
  platform?: 'node' | 'browser';
  environment: {
    node: string;
    os: string;
    cpu: string;
  };
  rows: number;
  storage?: "memory" | "disk";
  metrics: Record<MetricName, number>;
  timestamp: string;
};

export interface DBAdapter {
  readonly id: string; // e.g., better-sqlite3
  detectInstalled(): boolean;
  getPackageVersion(): string | undefined;
  getEngineVersion?(): Promise<string | undefined>;

  open(dbPath: string): Promise<void>;
  close(): Promise<void>;
  exec(sql: string): Promise<void>;
  run(sql: string, params?: any[]): Promise<void>;
  all<T = any>(sql: string, params?: any[]): Promise<T[]>;
  beginTransaction?(): Promise<void>;
  commitTransaction?(): Promise<void>;
  rollbackTransaction?(): Promise<void>;
}

export type NodeBenchOptions = {
  rows: number;
  dbDir?: string;
  implementations?: string[]; // filter by adapter id
  storage?: "memory" | "disk" | "both";
};
