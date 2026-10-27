import { Redirect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/providers/auth-provider';
import SignInScreen from '../sign-in';

/** Universal links for printed venue QR codes (/v/<code>) join the venue, like the web. This route sits outside
 * the signed-in group, so a signed-out visitor signs in right here and still lands on the venue. */
export default function VenueLinkScreen() {
  const { userId } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  return userId ? <Redirect href={{ pathname: '/scan', params: { code: `v:${id}` } }} /> : <SignInScreen />;
}
