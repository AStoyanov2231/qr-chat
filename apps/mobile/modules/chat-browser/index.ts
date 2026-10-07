import { requireOptionalNativeModule } from 'expo';

/** Opens the system browser view (SFSafariViewController / Custom Tab) with a collapsed "Back to chat" bar. Null without a dev build. */
export const ChatBrowser = requireOptionalNativeModule<{ open(url: string, title: string): Promise<void> }>('ChatBrowser');
