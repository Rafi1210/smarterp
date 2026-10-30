'use client';
export async function authFetch(input,options){const response=await globalThis.fetch(input,options);if(response.status===401&&typeof window!=='undefined'){const target=window.location.pathname+window.location.search;window.location.assign('/login?returnTo='+encodeURIComponent(target));throw Error('Session expired. Sign in again.');}return response;}
