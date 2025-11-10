import {useSegment} from '@/providers/segment-provider';

export const useSegmentAnalytics = () => {
  const {analytics} = useSegment();

  const track = (id: string, params?: Record<string, any>) => {
    void analytics?.track(id, {
      ...params
    });
  };

  const page = (id: string, params?: Record<string, any>) => {
    void analytics?.page(id, {
      ...params
    });
  };

  return {track, page};
};
