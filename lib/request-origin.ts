export function allowedOrigin(requestUrl:string, origin:string|null, appUrl:string|undefined) {
  if(!origin)return true;
  const allowed=new Set([new URL(requestUrl).origin]);
  // A hosting proxy may reconstruct the internal request URL with a different host.
  // Only the explicitly configured public origin is added; never trust forwarded headers.
  if(appUrl)allowed.add(new URL(appUrl).origin);
  return allowed.has(origin);
}
