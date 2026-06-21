export type RuntimeEnv = Env & {
  ENABLE_EXTERNAL_RELAY?: string;
  UPSTREAM_RELAY_TOKEN?: string;
  RESEND_API_KEY?: string;
  AUTH_FROM_EMAIL?: string;
  PUBLIC_APP_ORIGIN?: string;
  DEV_RETURN_MAGIC_LINK?: string;
};
