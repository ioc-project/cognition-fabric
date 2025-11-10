import {Container} from '@magnetic/container';
import {Warning} from '@magnetic/icons';
import React from 'react';
import {Text} from '@magnetic/text';
import {Heading} from '@magnetic/heading';

export const PlaceholderPageContent: React.FC<{type?: 'placeholder' | 'mock'}> = ({type = 'placeholder'}) => {
  const title = type === 'placeholder' ? 'This page is a placeholder' : 'This page contains mock data';
  const description = type === 'placeholder' ? 'This page has not been implemented yet.' : 'This page contains mock data for development purposes.';

  return (
    <Container.Well style={{paddingTop: 16, paddingBottom: 16}}>
      <div className="flex items-center px-2 text-sm gap-4">
        <Warning className="w-6 h-6" />
        <div>
          <Heading className="font-semibold pb-1">{title}</Heading>
          <Text>{description}</Text>
        </div>
      </div>
    </Container.Well>
  );
};
