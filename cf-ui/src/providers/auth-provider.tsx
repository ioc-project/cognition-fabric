import React from 'react';
import {AuthConfigCCI, AuthConfigIAM, CCI, IAM} from '@outshift/auth-providers-react';
import {Loading} from '@/components/ui/loading';
import {getAuthConfig, isMultiTenant} from '@/utils/getAuthConfig';

export const AuthProvider = ({children}: React.PropsWithChildren) => {
  const authConfig = getAuthConfig();

  if (isMultiTenant) {
    return (
      <IAM.AuthProvider loadingComponent={<Loading />} authConfig={authConfig as AuthConfigIAM}>
        {children}
      </IAM.AuthProvider>
    );
  } else {
    return (
      <CCI.AuthProvider loadingComponent={<Loading />} authConfig={authConfig as AuthConfigCCI}>
        {children}
      </CCI.AuthProvider>
    );
  }
};
