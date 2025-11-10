import {useAuth} from '@/hooks';
import {ExampleAPI, IamAPI} from '@/api/services';
import {Loading} from '@/components/ui/loading';
import {isMultiTenant} from '@/utils/getAuthConfig';
import {useEffect, useState} from 'react';

export const ApiProvider = ({children}: React.PropsWithChildren) => {
  const [isSet, setIsSet] = useState<boolean>(false);
  const {authInfo, tokenExpiredHttpHandler, logout} = useAuth();

  useEffect(() => {
    if (isMultiTenant) {
      IamAPI.setTokenExpiredHandlers({tokenExpiredHttpHandler, logout});
    }
    ExampleAPI.setTokenExpiredHandlers({tokenExpiredHttpHandler, logout});
  }, [tokenExpiredHttpHandler, logout]);

  useEffect(() => {
    if (authInfo && authInfo.isAuthenticated) {
      if (isMultiTenant) {
        IamAPI.setAuthInfo(authInfo);
      }
      ExampleAPI.setAuthInfo(authInfo);
      setIsSet(true);
    } else {
      setIsSet(true);
    }
  }, [authInfo]);

  if (!isSet) {
    return <Loading />;
  }

  return <>{children}</>;
};
