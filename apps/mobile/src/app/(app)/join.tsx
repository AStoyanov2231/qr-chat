import { Redirect } from 'expo-router';

/** qrchat://join links land here; joining always needs a fresh scan. */
export default function JoinScreen() { return <Redirect href="/scan" />; }
