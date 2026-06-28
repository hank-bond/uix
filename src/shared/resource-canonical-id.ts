// resource canonical id brand and constructor.
//
// A resource canonical id is the downstream URL scheme used by the resource
// transport. The resource facet derives it from feature id + local resource
// name so feature authors do not hand-author protocol strings.

const ResourceCanonicalIdBrand: unique symbol = Symbol("ResourceCanonicalId");

export type ResourceCanonicalId = string & {
  readonly [ResourceCanonicalIdBrand]: true;
};

/**
 * Builds the URL scheme for a resource contribution: `${featureId}-${name}`.
 * Validates each segment; a failure is an app bug.
 */
export function toResourceCanonicalId(
  featureId: string,
  name: string,
): ResourceCanonicalId {
  assertResourceToken("feature id", featureId);
  assertResourceToken("resource name", name);
  return `${featureId}-${name}` as ResourceCanonicalId;
}

function assertResourceToken(label: string, token: string): void {
  const resourceTokenPattern = /^[a-z][a-z0-9-]*$/;
  if (!resourceTokenPattern.test(token)) {
    throw new Error(
      `Invalid ${label}: ${token}. Expected ${resourceTokenPattern}.`,
    );
  }
}
