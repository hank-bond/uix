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

export interface FeatureSetting<Schema extends TSchema = TSchema> {
  schema: Schema;
  default: Static<Schema>;
}

export type FeatureSettings = Record<string, FeatureSetting<TSchema>>;

type FeatureSettingsInput = Record<
  string,
  { schema: TSchema; default: unknown }
>;

type FeatureSettingsWithCheckedDefaults<Settings extends FeatureSettingsInput> =
  {
    [Key in keyof Settings]: Settings[Key] extends {
      schema: infer Schema extends TSchema;
    }
      ? FeatureSetting<Schema>
      : never;
  };

export function defineFeatureSettings<
  const Settings extends FeatureSettingsInput,
>(settings: Settings & FeatureSettingsWithCheckedDefaults<Settings>): Settings {
  return settings;
}

export interface FeatureSettingsStore {
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  onChange(key: string, handler: (value: unknown) => void): () => void;
}
