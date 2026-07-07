import type { Static, TSchema } from "typebox";

export interface FeatureSettingDefinition<Schema extends TSchema = TSchema> {
  key: string;
  schema: Schema;
  default: Static<Schema>;
}

export interface FeatureSettings {
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  onChange(key: string, handler: (value: unknown) => void): () => void;
}
