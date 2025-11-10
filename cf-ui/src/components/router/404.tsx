import {Button} from '@magnetic/button';
import {Card} from '@magnetic/card';
import {Warning} from '@magnetic/icons';
import {Text} from '@magnetic/text';
import React from 'react';
import {useNavigate} from 'react-router-dom';

const NotFound: React.FC = () => {
  const navigate = useNavigate();

  const handleClick = (e: {preventDefault: () => void}) => {
    e.preventDefault();
    navigate(-1);
  };

  return (
    <Card>
      <div className="flex flex-col gap-2 items-center justify-center">
        <div>
          <div className="p-3 inline-flex items-center align-center rounded-full">
            <Warning className="w-10 h-10" />
          </div>
        </div>
        <Text>
          <h1 className="font-bold">404: Page not found</h1>
        </Text>
        <Text>Sorry, we can&apos;t find the page you&apos;re looking for. It might have been removed or renamed, or maybe it never existed.</Text>
        <Button onClick={handleClick} className="mt-3">
          Go Back
        </Button>
      </div>
    </Card>
  );
};

export default NotFound;
