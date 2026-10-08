// AbortController works in browsers that do not implement AbortSignal.timeout.
// Keep the deadline active through JSON decoding, not only response headers.
export async function fetchJSON(url, options={}, timeoutMs=3000) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response=await fetch(url,{...options,signal:controller.signal});
    const value=await response.json();
    return {response,value};
  } finally {
    clearTimeout(timer);
  }
}
