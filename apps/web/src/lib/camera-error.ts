const BLOCKED = "Camera access is blocked. Allow it in your browser settings, then try again.";
const UNAVAILABLE = "The camera could not start. Check your browser permissions and try again.";

/** qr-scanner can replace the original getUserMedia error with "Camera not found." */
export async function cameraErrorMessage(reason: unknown, permissions?: Pick<Permissions, "query">): Promise<string> {
  const message = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
  if (/permission|denied|notallowed/i.test(message)) return BLOCKED;

  let permission: PermissionState | undefined;
  try { permission = (await permissions?.query({ name: "camera" as PermissionName }))?.state; }
  catch { /* Some browsers do not support querying camera permission. */ }
  if (permission === "denied") return BLOCKED;

  if (/notfounderror|devicesnotfounderror/i.test(message)
      || (permission === "granted" && /not.?found|no camera/i.test(message))) {
    return "No camera was found on this device.";
  }
  return UNAVAILABLE;
}
