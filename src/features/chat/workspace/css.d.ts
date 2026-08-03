// The CSS module import shape for TypeScript.
// CSS module scripts (import ... with { type: "css" }) are executed natively
// by the browser; this declaration teaches TypeScript their shape.
declare module "*.css" {
  const sheet: CSSStyleSheet;
  export default sheet;
}
