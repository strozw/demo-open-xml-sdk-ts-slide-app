/**
 * Browser stand-in for node:fs. ltxmlts (the LINQ-to-XML layer under
 * openxmlsdkts) imports "fs" at module top level for its load-from-file
 * helpers (`XDocument.load` etc.), which this app never calls in the
 * browser — but Turbopack statically verifies that the imported names
 * exist, so the stub must export them.
 */
function unavailable(): never {
  throw new Error("fs is not available in the browser");
}

export const readFileSync = unavailable;

export const promises = {
  readFile: unavailable,
};

export default { readFileSync, promises };
