import cloudflareAccessPlugin from '@cloudflare/pages-plugin-cloudflare-access';
export const onRequest = (context) => cloudflareAccessPlugin({domain:context.env.ACCESS_TEAM_DOMAIN,aud:context.env.ACCESS_AUD})(context);
