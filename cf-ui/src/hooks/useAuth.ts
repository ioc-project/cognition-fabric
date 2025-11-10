import {isMultiTenant} from '@/utils/getAuthConfig';
import {CCI, IAM} from '@outshift/auth-providers-react';

export const useAuth = () => {
  const iamAuth = IAM.useAuth;
  const cciAuth = CCI.useAuth;
  if (isMultiTenant) {
    return iamAuth();
  } else {
    return cciAuth();
  }
};
