import {BasePage} from '@/components/ui/base-page';
import {PlaceholderPageContent} from '@/components/ui/placeholder-page-content';
import {Button} from '@magnetic/button';

const Dashboard = () => {
  const TABS = [
    {
      title: 'Tab 1',
      link: '/'
    },
    {
      title: 'Tab 2',
      link: '#'
    }
  ];
  return (
    <BasePage title="Dashboard" description="Some description" callToAction={<Button>Action</Button>} tabs={TABS}>
      <PlaceholderPageContent />
    </BasePage>
  );
};

export default Dashboard;
