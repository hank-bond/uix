// shared contribution-id brand and constructor.
//
// Every facet derives its registry dedup id from the same dotted grammar so
// the contributionId is uniform across the substrate:
//
//   `${featureId}.<facet>.<name>`
//
// Most facets allow multiple contributions per feature, differentiated by
// `name`. Singleton facets (one contribution per feature, e.g. private state)
// omit `name` and the id becomes `${featureId}.<facet>`.
//
// The ContributionId brand is nominal: a value of this type can only have come
// through `toContributionId(...)`, which validates the feature id, facet segment,
// and optional local name against the shared token grammar. Internal code carries
// the brand; genuine external string boundaries cast inline (`id as string`).

const ContributionIdBrand: unique symbol = Symbol("ContributionId");

export type ContributionId = string & {
  readonly [ContributionIdBrand]: true;
};

/**
 * Builds the registry dedup id for a contribution: `${featureId}.<facet>.<name>`.
 * Validates each segment; a failure is an app bug.
 */
export function toContributionId(
  featureId: string,
  facet: string,
  name?: string,
): ContributionId {
  assertIdToken("feature id", featureId);
  assertIdToken("facet", facet);
  if (name !== undefined) {
    assertIdToken("contribution name", name);
    return `${featureId}.${facet}.${name}` as ContributionId;
  }
  return `${featureId}.${facet}` as ContributionId;
}

function assertIdToken(label: string, token: string): void {
  const idTokenPattern = /^[a-z][a-z0-9_-]*$/;
  if (!idTokenPattern.test(token)) {
    throw new Error(`Invalid ${label}: ${token}. Expected ${idTokenPattern}.`);
  }
}
