/** The readable message inside an error from Apex or Lightning Data Service. */
export function errorMessage(error) {
  if (!error) {
    return "Something went wrong.";
  }
  if (typeof error === "string") {
    return error;
  }
  const body = error.body;
  if (Array.isArray(body)) {
    return body.map((b) => b.message).join(" ");
  }
  if (body && body.message) {
    return body.message;
  }
  return error.message || "Something went wrong.";
}
