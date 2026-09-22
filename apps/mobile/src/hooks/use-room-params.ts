import { useRoute } from 'expo-router';
import type { RouteProp } from 'expo-router/react-navigation';

type RoomParams = { groupId?: string; code?: string; name?: string };

export function useRoomParams(): RoomParams {
  // Search params are already decoded by the URL parser. Expo Router 57's
  // useLocalSearchParams decodes them again, changing opaque keys like Room%2FA.
  return useRoute<RouteProp<{ room: RoomParams }, 'room'>>().params ?? {};
}
