import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { LandingPage } from '@/components/home/landing-page';
import { baseOptions } from '@/lib/layout.shared';

export default function RootPage() {
  return (
    <HomeLayout {...baseOptions('en')}>
      <LandingPage lang="en" />
    </HomeLayout>
  );
}
