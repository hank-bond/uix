import { Type, type Static, type TObject, type TRecord } from "typebox";

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
 * One complete settings scope. The schema must describe an object; `default`
 * is a complete valid scope value whose missing fields hydrate persisted data.
 */
type SettingsSchema = TObject | TRecord;

export interface SettingsDefinition<
  Schema extends SettingsSchema = SettingsSchema,
> {
  readonly schema: Schema;
  readonly default?: Static<Schema>;
}

/**
 * Defines one settings scope and closes its object schema. A `Type.Object`
 * schema gives the scope named keys; a `Type.Record` schema gives it dynamic,
 * schema-validated keys without introducing a second settings concept.
 */
export function defineSettings<const Schema extends SettingsSchema>(
  definition: SettingsDefinition<Schema>,
): SettingsDefinition<Schema> {
  if (!Type.IsObject(definition.schema) && !Type.IsRecord(definition.schema)) {
    throw new Error("Settings schema must be a Type.Object or Type.Record");
  }
  return {
    ...definition,
    schema: {
      ...definition.schema,
      additionalProperties: false,
    },
  };
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
