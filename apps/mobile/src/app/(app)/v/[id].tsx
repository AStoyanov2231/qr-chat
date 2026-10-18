import { Redirect } from 'expo-router';

/** Universal links for printed venue QR codes land here; like qrchat://join, joining needs a fresh scan. */
export default function VenueLinkScreen() { return <Redirect href="/scan" />; }
