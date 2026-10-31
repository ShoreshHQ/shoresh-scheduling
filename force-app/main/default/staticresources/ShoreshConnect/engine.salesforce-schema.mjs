// What @salesforce/schema gives a screen: the names, with the package's prefix (if any).
export function schemaName(name) {
  const prefix = globalThis.SHORESH_NAMESPACE ? `${globalThis.SHORESH_NAMESPACE}__` : "";
  const [objectApiName, fieldApiName] = name.split(".").map((n) => (/__(c|r)$/.test(n) ? prefix + n : n));
  return fieldApiName ? { objectApiName, fieldApiName } : { objectApiName };
}
