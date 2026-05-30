// trellis-core — pi side.
//
// This will become the canonical pi extension for the Trellis cockpit.
// Milestone 4 fills it in:
//   - append a system-prompt orientation block describing the cockpit
//   - append the Trellis documentation topic map (so the agent can read
//     Trellis docs the same way it reads pi docs)
//   - register a small set of smoke-test cockpit tools
//
// For now this is an empty placeholder so the package layout is in
// place. The Trellis loader (to be built) discovers this package and
// will hand the path off to pi's extension system when agent
// integration lands (milestone 5).

export default {};
