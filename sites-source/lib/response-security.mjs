// Preserve same-origin form Origin headers while omitting referrers to other sites.
export function secureAppResponse(result) {
 const response=new Response(result.body,result);
 response.headers.set('cache-control','private, no-store');
 response.headers.set('referrer-policy','same-origin');
 response.headers.set('x-content-type-options','nosniff');
 response.headers.set('x-frame-options','DENY');
 return response;
}
