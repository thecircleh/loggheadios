import { registerPlugin } from '@capacitor/core';

// Native only (iOS + Android); there is no web implementation.
// Use the proxy directly — never return it from an async function or resolve a promise with
// it (promises call proxy.then(), which goes to native and never settles).
export const ClipStitcher = registerPlugin('ClipStitcher');
