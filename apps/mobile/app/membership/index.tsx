import { useEffect } from 'react';
import { router } from 'expo-router';

export default function MembershipIndex() {
  useEffect(() => {
    // Redirect to pricing page
    router.replace('/pricing');
  }, []);

  return null;
}
