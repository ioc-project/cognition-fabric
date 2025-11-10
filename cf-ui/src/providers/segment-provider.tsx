import {createContext, useContext} from 'react';
import {AnalyticsBrowser} from '@segment/analytics-next';
import {getSegmentConfig} from '@/utils/getSegmentConfig';
import React from 'react';

type SegmentProviderState = {
  analytics?: AnalyticsBrowser;
};

const SegmentProviderContext = createContext<SegmentProviderState | undefined>(undefined);

export const SegmentProvider = ({children}: React.PropsWithChildren) => {
  const {segmentId} = getSegmentConfig();

  const analytics = React.useMemo(() => {
    if (segmentId) {
      return AnalyticsBrowser.load({writeKey: segmentId});
    }
    return;
  }, [segmentId]);

  const value = {
    analytics
  };

  return <SegmentProviderContext.Provider value={value}>{children}</SegmentProviderContext.Provider>;
};

export const useSegment = () => {
  const context = useContext(SegmentProviderContext);

  if (context === undefined) {
    throw new Error('useSegment must be used within a SegmentProvider');
  }

  return context;
};
