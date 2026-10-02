import { readFileSync, existsSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { LocalRouteParamsContext } from 'expo-router/build/Route.js';
import { NavigationRouteContext } from 'expo-router/build/react-navigation/core/NavigationProvider.js';
import { resolveHref } from 'expo-router/build/link/href.js';
import { parseQueryParams } from 'expo-router/build/fork/getStateFromPath-forks.js';

const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Host controls are mocked; these tests verify React actions/state, not native rendering.
export const state = globalThis.__qrChatNativeTest = {};
const mocks = {
  'react-native': `
    import React from 'react';
    export const View='View', Text='Text', TextInput='TextInput', Pressable='Pressable', Button='Button', ScrollView='ScrollView', KeyboardAvoidingView='KeyboardAvoidingView', ActivityIndicator='ActivityIndicator';
    export const Animated={Value:class {setValue(){} interpolate(){return 0;}},View:'AnimatedView',timing:()=>({start:callback=>callback?.({finished:true})})};
    export const Modal=({visible,...props})=>visible?React.createElement('Modal',{visible,...props},props.children):null;
    export const StyleSheet={create: value => value};
    export const useWindowDimensions=()=>({width:390,height:844});
    export const Alert={alert: (...args) => globalThis.__qrChatNativeTest.alerts.push(args)};
    export const Linking={
      openSettings: async () => { globalThis.__qrChatNativeTest.settingsOpened=true; },
      getInitialURL: async () => globalThis.__qrChatNativeTest.initialURL ?? null,
      addEventListener: (_event,callback) => { const listeners=globalThis.__qrChatNativeTest.linkListeners; listeners.add(callback); return {remove:()=>listeners.delete(callback)}; },
    };
    export const AppState={currentState:'active', addEventListener: (_event,callback) => { const listeners=globalThis.__qrChatNativeTest.appListeners; listeners.add(callback);return {remove:()=>listeners.delete(callback)}; }};
    export function FlatList({data, renderItem, keyExtractor, ListEmptyComponent, ListHeaderComponent, ListFooterComponent, ...props}) {
      return React.createElement('FlatList', props, ListHeaderComponent, data.length ? data.map((item,index) => React.createElement(React.Fragment,{key:keyExtractor(item)},renderItem({item,index}))) : ListEmptyComponent, ListFooterComponent);
    }`,
  '@expo/ui': `
    import React from 'react';
    export const Host=({children,...props})=>React.createElement('Host',props,children);
    export const Button=({label,...props})=>React.createElement('Button',{...props,title:label});`,
  'expo-router': `
    import React, {useEffect} from 'react';
    export const router=Object.fromEntries(['push','replace','dismissTo','back'].map(method => [method,(...args) => globalThis.__qrChatNativeTest.navigation.push([method,...args])]));
    router.canGoBack=()=>true;
    export {useLocalSearchParams} from 'expo-router/build/hooks/useLocalSearchParams.js';
    export {useRoute} from 'expo-router/build/react-navigation/core/useRoute.js';
    export const useFocusEffect=callback=>useEffect(callback,[callback]);
    export const Redirect=({href})=>{useEffect(()=>{router.replace(href);},[href]);return null;};
    export const Stack=({children,...props})=>React.createElement('NativeStack',props,children);
    Stack.Screen=props=>React.createElement('NativeStackScreen',props);`,
  'expo-router/react-navigation': 'export const useHeaderHeight=()=>64;',
  'react-native-safe-area-context': 'export const useSafeAreaInsets=()=>({top:24,right:0,bottom:24,left:0});',
  'react-native-screens/experimental': "export const SafeAreaView='NativeSafeAreaView';",
  'react-native-reanimated': "export const useReducedMotion=()=>true;",
  'expo-network': "export const useNetworkState=()=>globalThis.__qrChatNativeTest.networkState ?? {isConnected:true,isInternetReachable:true};",
  'expo-glass-effect': "export const GlassView='GlassView';export const isGlassEffectAPIAvailable=()=>false;",
  'expo-image': "export const Image='Image';",
  'expo-crypto': "export const randomUUID=()=> '22222222-2222-4222-8222-222222222222';",
  'expo-image-picker': `export async function launchImageLibraryAsync(options) {
    const state=globalThis.__qrChatNativeTest; state.pickerOptions=options;
    if(state.pickerError) throw new Error(state.pickerError);
    return state.pickerResult ?? {canceled:true,assets:null};
  }`,
  'expo-file-system': `export class File { constructor(uri) {this.uri=uri;} async arrayBuffer(){return new Uint8Array([255,216,255,1]).buffer;} }`,
  'expo-image-manipulator': `export const SaveFormat={JPEG:'jpeg'};
    export const ImageManipulator={manipulate(uri){
      const state=globalThis.__qrChatNativeTest; state.imageActions=[['source',uri]];
      const context={crop(rect){state.imageActions.push(['crop',rect]);return context;},resize(size){state.imageActions.push(['resize',size]);return context;},
        async renderAsync(){return {async saveAsync(options){state.imageActions.push(['save',options]);return {uri:'file:///prepared.jpg'};},release(){}};},release(){}};
      return context;
    }};`,
  'expo-symbols': "export const SymbolView='SymbolView';",
  'expo-camera': `export const CameraView='CameraView'; const request=async()=>{globalThis.__qrChatNativeTest.permissionRequested=true;}; const get=async()=>{globalThis.__qrChatNativeTest.permissionChecked=true;}; export const useCameraPermissions=()=>[globalThis.__qrChatNativeTest.permission,request,get];`,
  '@/providers/auth-provider': 'export const useAuth=()=>globalThis.__qrChatNativeTest.auth;',
  '@/providers/chat-provider': 'export const useChat=()=>globalThis.__qrChatNativeTest.chat; export const ChatProvider=({children})=>children; export const errorMessage=error=>error.message || "Could not connect. Please try again.";',
  '@/lib/supabase': 'export const webOrigin="https://chat.example"; export const getNativeApi=()=>globalThis.__qrChatNativeTest.nativeApi ?? null;',
  '@qr-chat/api': `
    export {getChatStore} from '${new URL('./chat-store.mjs', import.meta.url).href}';
    export const loadDirectSnapshot=(...args)=>globalThis.__qrChatNativeTest.loadDirectSnapshot(...args);
    export const loadChatSnapshot=(...args)=>globalThis.__qrChatNativeTest.loadChatSnapshot(...args);
    export const emptySnapshot={session:null,group:null,friends:[],expiresAt:null,directPreviews:{}};
    export function watchChanges(client,filters,refresh,onState) {
      const watcher={filters,refresh,onState,stopped:false,stop(){this.stopped=true;}};
      globalThis.__qrChatNativeTest.watchers.push(watcher);onState('connected');return watcher;
    }`,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'qrcode/lib/core/qrcode') return nextResolve('qrcode/lib/core/qrcode.js', context);
    if (specifier in mocks) return { url: `qr-chat-test:${specifier}`, shortCircuit: true };
    if (specifier === './auth-provider' && context.parentURL?.endsWith('/providers/chat-provider.tsx')) return { url: 'qr-chat-test:@/providers/auth-provider', shortCircuit: true };
    if (context.parentURL?.startsWith('qr-chat-test:')) return nextResolve(specifier, { ...context, parentURL: import.meta.url });
    const candidate = specifier.startsWith('@/') ? path.join(sourceRoot, specifier.slice(2))
      : specifier.startsWith('.') && context.parentURL?.startsWith(pathToFileURL(sourceRoot).href)
        ? fileURLToPath(new URL(specifier, context.parentURL)) : null;
    if (candidate) {
      const file = [candidate, `${candidate}.tsx`, `${candidate}.ts`].find(value => existsSync(value));
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('qr-chat-test:')) return { format: 'module', source: mocks[url.slice('qr-chat-test:'.length)], shortCircuit: true };
    if (url.startsWith(pathToFileURL(sourceRoot).href) && /\.tsx?$/.test(url)) {
      let source = readFileSync(new URL(url), 'utf8');
      if (process.env.QR_CHAT_TEST_COMPILED_ROOM === '1' && url.endsWith('/app/(app)/room.tsx')) {
        // Exercise the installed Expo compiler too: its dependency extraction can
        // expose nullable accesses that plain TypeScript transpilation leaves safe.
        const require = createRequire(import.meta.url);
        const expoRequire = createRequire(require.resolve('expo/package.json'));
        const presetRequire = createRequire(expoRequire.resolve('babel-preset-expo/package.json'));
        source = presetRequire('@babel/core').transformSync(source, {
          filename: fileURLToPath(url), babelrc: false, configFile: false,
          parserOpts: { plugins: ['typescript', 'jsx'] },
          plugins: [[presetRequire.resolve('babel-plugin-react-compiler'), { target: '19' }]],
        }).code;
      }
      return { format: 'module', shortCircuit: true, source: ts.transpileModule(source, {
        fileName: fileURLToPath(url), compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText };
    }
    return nextLoad(url, context);
  },
});

export function reset() {
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, {
    params: {}, navigation: [], alerts: [], watchers: [], appListeners: new Set(), linkListeners: new Set(), loadDirectSnapshot: async()=>({messages:[],nextCursor:null}), permission: { granted: true, canAskAgain: true },
    auth: { userId: 'me', active: true, api: { resolveQrChatImage: async () => null } },
    chat: { ready: true, error: '', groupAccessEnded: false, session: { id: 'me', name: 'Andy' }, group: null, expiresAt: null, friends: [], directPreviews: {}, connection: 'connected', refresh: async () => {}, refreshGroup: async () => {}, openGroup: () => () => {}, loadOlder: async () => {}, scannedCode: null, acceptScan: code => { state.chat.scannedCode=code; }, clearScan: () => { state.chat.scannedCode=null; } },
    loadChatSnapshot: async () => ({session:{id:'me',name:'Andy'},group:null,friends:[],expiresAt:null,directPreviews:{}}),
  });
}

export async function render(t, Component, props = {}) {
  let tree;
  let mounted = true;
  const element = props => React.createElement(LocalRouteParamsContext.Provider, { value: state.params },
    React.createElement(NavigationRouteContext.Provider, { value: { key: 'test', name: 'test', params: state.params } }, React.createElement(Component, props)));
  await act(async () => { tree = create(element(props)); });
  t.after(async () => { if (mounted) await act(async () => { tree.unmount(); mounted = false; }); });
  return {
    get root() { return tree.root; },
    text: () => JSON.stringify(tree.toJSON()),
    async unmount() { if (mounted) await act(async () => { tree.unmount(); mounted = false; }); },
    async update(nextProps = props) { await act(async () => { tree.update(element(nextProps)); }); },
    async press(label, occurrence = 0) {
      const control = tree.root.findAll(node => node.type === 'Pressable' || node.type === 'Button').filter(node => node.props.accessibilityLabel === label || node.props.title === label || node.findAllByType('Text').some(text => text.props.children === label))[occurrence];
      if (!control) throw new Error(`Missing button: ${label}`);
      if (control.props.disabled) throw new Error(`Disabled button: ${label}`);
      await act(async () => { await control.props.onPress(); });
    },
    async type(label, value) {
      const control = tree.root.findAllByType('TextInput').find(node => node.props.accessibilityLabel === label);
      if (!control) throw new Error(`Missing input: ${label}`);
      await act(async () => { control.props.onChangeText(value); });
    },
  };
}
// Exercise the installed router's href serialization and search parsing, not a copy.
export function navigate(href) {
  state.params = parseQueryParams(resolveHref(href), { name: href.pathname }) ?? {};
}
export { act };
