import config from '@/config';
import {AuthProviderType} from '@/constants/auth';
import {AuthConfigCCI, AuthConfigIAM} from '@outshift/auth-providers-react';

export const getAuthConfig = () => {
  const iamConfig: AuthConfigIAM = {
    iamUI: (config.IAM_UI as string) ?? '',
    iamApi: (config.IAM_API as string) ?? '',
    productId: (config.IAM_PRODUCT_ID as string) ?? '',
    oktaIssuer: (config.IAM_OIDC_ISSUER as string) ?? '',
    oktaClient: (config.IAM_OIDC_CLIENT_ID as string) ?? '',
    configOptions: {
      redirectUri: `${window.location.protocol}//${window.location.host}`,
      devMode: false
    }
  };

  const cciConfig: AuthConfigCCI = {
    cciUi: (config.CCI_UI as string) ?? '',
    oktaIssuer: (config.CCI_OIDC_ISSUER as string) ?? '',
    oktaClient: (config.CCI_OIDC_CLIENT_ID as string) ?? ''
  };

  if (config.AUTH_PROVIDER === AuthProviderType.IAM) {
    return iamConfig;
  }
  if (config.AUTH_PROVIDER === AuthProviderType.CCI) {
    return cciConfig;
  }

  return undefined;
};

export const isMultiTenant = config.AUTH_PROVIDER === AuthProviderType.IAM || false;
