import { Type, type Static, type TSchema } from "typebox";

export const FeatureSettingAddressSchema = Type.Object({
  featureId: Type.String(),
  key: Type.String(),
});
export type FeatureSettingAddress = Static<typeof FeatureSettingAddressSchema>;

export const FeatureSettingValueEnvelopeSchema = Type.Object({
  featureId: Type.String(),
  key: Type.String(),
  value: Type.Unknown(),
});
export type FeatureSettingValueEnvelope = Static<
  typeof FeatureSettingValueEnvelopeSchema
>;

/**
 * One declared setting. Scope-neutral: the same shape declares settings for
 * a manifest feature entry and for a substrate-owned workspace namespace.
 */
export interface SettingDefinition<Schema extends TSchema = TSchema> {
  schema: Schema;
  /**
   * Hydrated into the manifest when no value is persisted. Omit to declare
   * an optional setting: it stays absent (reads as `undefined`) until the
   * first `set()`.
   */
  default?: Static<Schema>;
}

export type SettingDefinitions = Record<string, SettingDefinition<TSchema>>;

type SettingDefinitionsInput = Record<
  string,
  { schema: TSchema; default?: unknown }
>;

type SettingsWithCheckedDefaults<Settings extends SettingDefinitionsInput> = {
  [Key in keyof Settings]: Settings[Key] extends {
    schema: infer Schema extends TSchema;
  }
    ? SettingDefinition<Schema>
    : never;
};

export function defineSettings<const Settings extends SettingDefinitionsInput>(
  settings: Settings & SettingsWithCheckedDefaults<Settings>,
): Settings {
  return settings;
}

/**
 * Scope-bound settings view — the same shape whether the scope is a
 * manifest feature entry or a substrate-owned workspace namespace.
 */
export interface SettingsHandle {
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  onChange(key: string, handler: (value: unknown) => void): () => void;
}
