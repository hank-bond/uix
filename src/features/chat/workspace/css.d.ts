// The CSS module import shape for TypeScript.
// The browser executes CSS module scripts (import ... with { type: "css" })
// natively. This declaration teaches TypeScript their shape.
declare module "*.css" {
  const sheet: CSSStyleSheet;
  export default sheet;
}
