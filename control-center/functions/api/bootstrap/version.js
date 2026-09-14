import { jsonResponse } from '../../../lib/http.js';
export function onRequestGet() { return jsonResponse({ bootstrapVersion: 1 }); }
