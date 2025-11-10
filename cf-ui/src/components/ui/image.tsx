/*!
 * Copyright (c) 2024 Cisco and/or its affiliates.
 *
 * PROPRIETARY AND CONFIDENTIAL - ALL USE MUST BE LICENSED
 *
 * The code, technical concepts, all information contained herein and related
 * documentation are the property of, proprietary to and are vested in Cisco
 * Technology, Inc. and/or its affiliated entities, ("Cisco") under various
 * laws including copyright, international treaties, patent, trade secret
 * and/or contract. Any copying, dissemination, reverse engineering, disclosure
 * or other use of the material contained herein without an express license
 * from Cisco is prohibited and, among other legal consequences, constitutes an
 * infringement of the intellectual property and the proprietary rights of
 * Cisco. All use of the material herein must be in strict accordance with the
 * terms of the license you have entered into with Cisco.
 */

import {Loader} from '@magnetic/icons';
import {Tag} from '@magnetic/tag';
import React, {useEffect, useState} from 'react';

interface ImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallbackElement?: React.ReactNode;
}

export const Image: React.FC<ImageProps> = ({src, fallbackElement, ...props}) => {
  const [isValidImage, setIsValidImage] = useState<boolean>(false);
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const validateImageUrl = async (url: string | undefined) => {
      if (!url) {
        setIsValidImage(false);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 seconds timeout
      try {
        const response = await fetch(url, {method: 'GET', mode: 'no-cors', signal: controller.signal});
        clearTimeout(timeoutId);
        if (response.ok || response.type === 'opaque') {
          setImageUrl(url);
          setIsValidImage(true);
        } else {
          setIsValidImage(false);
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          console.error('Fetch request timed out');
        } else {
          console.error('Fetch request failed', error);
        }
        setIsValidImage(false);
      } finally {
        setIsLoading(false);
      }
    };
    void validateImageUrl(src);
  }, [src]);

  if (isLoading) {
    return <Loader className="inline w-4 h-4 animate-spin" />;
  }

  return isValidImage ? <img src={imageUrl} {...props} /> : fallbackElement ? fallbackElement : <Tag.Colored color={10}>Image not found</Tag.Colored>;
};
