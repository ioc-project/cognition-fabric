import config from '@/config';

export const getSegmentConfig = () => {
  return {
    segmentId: (config.SEGMENT_ID as string) ?? ''
  };
};
