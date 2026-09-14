import { json } from '../../../lib/http.js';
export function onRequestGet() { return json({ bootstrapVersion: 1 }); }
