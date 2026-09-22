import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, ErrorNotice, Screen, Skeleton } from '@/components/chat-ui';
import { authCallback } from '@/lib/supabase';
import { completeSignIn } from '@/lib/oauth';

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; sb_flow_id?: string; error?: string }>();
  const [error, setError] = useState('');
  const code = params.code;
  const flowId = params.sb_flow_id;
  const authError = params.error;
  useEffect(() => {
    let stopped = false;
    const finish = async () => {
      if (typeof code !== 'string' || (flowId !== undefined && typeof flowId !== 'string') || authError) throw new Error('Sign-in was not completed. Please try again.');
      const query = new URLSearchParams({ code, ...(flowId ? { sb_flow_id: flowId } : {}) });
      await completeSignIn(`${authCallback}?${query}`);
      if (!stopped) router.replace('/');
    };
    void finish().catch(() => { if (!stopped) setError('Could not complete sign-in. Please try again.'); });
    return () => { stopped = true; };
  }, [code, flowId, authError]);
  return <Screen>{error ? <><ErrorNotice message={error} /><Button label="Back to sign in" onPress={() => router.replace('/sign-in')} /></> : <Skeleton />}</Screen>;
}
