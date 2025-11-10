import isEnvSet from '@/utils/isEnvSet';

declare global {
  interface Window {
    apiUrl?: string;
    logLevel?: string;
    iamProductId?: string;
    iamUi?: string;
    iamApi?: string;
    iamOidcClientId?: string;
    iamOidcScopes?: string;
    iamOidcIssuer?: string;
    segmentId?: string;
    cciUi?: string;
    cciOidcClientId?: string;
    cciOidcScopes?: string;
    cciOidcIssuer?: string;
    authProvider?: 'CCI' | 'IAM';
  }
}

export default {
  API_HOST: isEnvSet(import.meta.env.VITE_API_URL) ? import.meta.env.VITE_API_URL : window.apiUrl,
  IAM_PRODUCT_ID: isEnvSet(import.meta.env.VITE_IAM_PRODUCT_ID) ? import.meta.env.VITE_IAM_PRODUCT_ID : window.iamProductId,
  LOG_LEVEL: isEnvSet(import.meta.env.VITE_APP_LOG_LEVEL) ? import.meta.env.VITE_APP_LOG_LEVEL : window.logLevel,
  IAM_UI: isEnvSet(import.meta.env.VITE_IAM_UI) ? import.meta.env.VITE_IAM_UI : window.iamUi,
  IAM_API: isEnvSet(import.meta.env.VITE_IAM_API) ? import.meta.env.VITE_IAM_API : window.iamApi,
  IAM_OIDC_CLIENT_ID: isEnvSet(import.meta.env.VITE_IAM_OIDC_CLIENT_ID) ? import.meta.env.VITE_IAM_OIDC_CLIENT_ID : window.iamOidcClientId,
  IAM_OIDC_ISSUER: isEnvSet(import.meta.env.VITE_IAM_OIDC_ISSUER) ? import.meta.env.VITE_IAM_OIDC_ISSUER : window.iamOidcIssuer,
  SEGMENT_ID: isEnvSet(import.meta.env.VITE_SEGMENT_ID) ? import.meta.env.VITE_SEGMENT_ID : window.segmentId,
  CCI_UI: isEnvSet(import.meta.env.VITE_CCI_UI) ? import.meta.env.VITE_CCI_UI : window.cciUi,
  CCI_OIDC_CLIENT_ID: isEnvSet(import.meta.env.VITE_CCI_OIDC_CLIENT_ID) ? import.meta.env.VITE_CCI_OIDC_CLIENT_ID : window.cciOidcClientId,
  CCI_OIDC_SCOPES: isEnvSet(import.meta.env.VITE_CCI_OIDC_SCOPES) ? import.meta.env.VITE_CCI_OIDC_SCOPES : window.cciOidcScopes,
  CCI_OIDC_ISSUER: isEnvSet(import.meta.env.VITE_CCI_OIDC_ISSUER) ? import.meta.env.VITE_CCI_OIDC_ISSUER : window.cciOidcIssuer,
  AUTH_PROVIDER: isEnvSet(import.meta.env.VITE_AUTH_PROVIDER) ? import.meta.env.VITE_AUTH_PROVIDER : 'IAM'
};
