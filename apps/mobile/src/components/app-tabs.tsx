import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { colors } from './chat-ui';

export default function AppTabs() {
  return (
    <NativeTabs
      tintColor={colors.ink}
      backgroundColor={process.env.EXPO_OS === 'android' ? colors.paper : undefined}
      indicatorColor={colors.blue}
      labelStyle={{ selected: { color: colors.ink } }}>
      <NativeTabs.Trigger name="index" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'house', selected: 'house.fill' }} md="home"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="chats" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Label>Groups</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} md="group" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person', selected: 'person.fill' }} md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
