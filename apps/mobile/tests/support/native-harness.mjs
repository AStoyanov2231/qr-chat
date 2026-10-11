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
    export const Keyboard = { dismiss() {} };
    export const Animated={Value:class {setValue(){} stopAnimation(){} interpolate(){return 0;}},multiply:()=>0,View:'AnimatedView',timing:()=>({start:callback=>callback?.({finished:true})})};
    export const Easing={bezier:()=>value=>value};
    export const PanResponder={create:handlers=>({panHandlers:handlers})};
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
    const InputLabel=React.createContext(undefined);
    export const Host=({children,...props})=>React.createElement('Host',props,React.createElement(InputLabel.Provider,{value:props.accessibilityLabel},children));
    export function useNativeState(initialValue) {
      const [value,setValue]=React.useState(initialValue);
      const current=React.useRef(value);current.current=value;
      return React.useMemo(()=>({get value(){return current.current;},set value(next){current.current=next;setValue(next);},get(){return current.current;},set(next){globalThis.__qrChatNativeTest.nativeInputWrites=(globalThis.__qrChatNativeTest.nativeInputWrites??0)+1;current.current=next;setValue(next);}}),[]);
    }
    export function TextInput({value,onChangeText,...props}) {
      const label=React.useContext(InputLabel);
      return React.createElement('NativeTextInput',{...props,accessibilityLabel:label,value:value.value,
        onChangeText:next=>{value.value=next;onChangeText?.(next);}});
    }
    export const RNHostView=({children,...props})=>React.createElement('RNHostView',props,children);
    export const Button=({label,...props})=>React.createElement('Button',{...props,title:label});`,
  '@expo/ui/swift-ui': `
    import React from 'react';
    export {useNativeState} from '@expo/ui';
    export const Image=props=>React.createElement('SwiftUIImage',props);
    export const Button=props=>React.createElement('SwiftUIButton',props);
    export const Text=props=>React.createElement('SwiftUIText',props);`,
  '@expo/ui/swift-ui/modifiers': `
    export const buttonBorderShape=shape=>({$type:'buttonBorderShape',shape});
    export const buttonStyle=style=>({$type:'buttonStyle',style});
    export const controlSize=size=>({$type:'controlSize',size});
    export const frame=params=>({$type:'frame',...params});
    export const accessibilityLabel=label=>({$type:'accessibilityLabel',label});
    export const disabled=value=>({$type:'disabled',value});
    export const tint=color=>({$type:'tint',color});
    export const ignoreSafeArea=params=>({$type:'ignoreSafeArea',...params});
    export const foregroundStyle=style=>({$type:'foregroundStyle',style});
    export const font=params=>({$type:'font',...params});`,
  '@expo/ui/jetpack-compose': `
    import React from 'react';
    export const FilledIconButton=props=>React.createElement('FilledIconButton',props);
    export const Button=props=>React.createElement('ComposeButton',props);
    export const Text=props=>React.createElement('ComposeText',props);`,
  '@expo/ui/jetpack-compose/modifiers': `
    export const fillMaxWidth=fraction=>({$type:'fillMaxWidth',fraction});
    export const height=value=>({$type:'height',value});
    export const size=(width,height)=>({$type:'size',width,height});`,
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
  'react-native-reanimated': `
    export const useReducedMotion=()=>true;
    export default {View:'AnimatedView'};
    export const KeyboardState={UNKNOWN:0,OPENING:1,OPEN:2,CLOSING:3,CLOSED:4};
    export const Easing={bezier:()=>value=>value};
    export const useAnimatedKeyboard=()=>({height:{value:0},state:{value:4}});
    export const useSharedValue=value=>({value});
    export const useDerivedValue=compute=>({value:compute()});
    export const withTiming=value=>value;
    export const useAnimatedStyle=compute=>compute();
    export const useAnimatedReaction=()=>{};`,
  'react-native-worklets': 'export const scheduleOnRN=(fn,...args)=>fn(...args);',
  'expo-network': "export const useNetworkState=()=>globalThis.__qrChatNativeTest.networkState ?? {isConnected:true,isInternetReachable:true};",
  'expo-glass-effect': "export const GlassView='GlassView';export const isGlassEffectAPIAvailable=()=>false;",
  'expo-image': "export const Image='Image';",
  'expo-constants': "export default {appOwnership: 'standalone'};",
  'expo-web-browser': 'export const openAuthSessionAsync=(...args)=>globalThis.__qrChatNativeTest.openAuthSession(...args);',
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
  '../../../modules/chat-browser': "export const ChatBrowser={open:async(...args)=>{globalThis.__qrChatNativeTest.browserOpened=args;}};",
  'expo-symbols': "export const SymbolView='SymbolView';",
  'expo-camera': `export const CameraView='CameraView'; const request=async()=>{globalThis.__qrChatNativeTest.permissionRequested=true;}; const get=async()=>{globalThis.__qrChatNativeTest.permissionChecked=true;}; export const useCameraPermissions=()=>[globalThis.__qrChatNativeTest.permission,request,get];`,
  '@/providers/auth-provider': 'export const useAuth=()=>globalThis.__qrChatNativeTest.auth;',
  '@/providers/chat-provider': 'export const useChat=()=>globalThis.__qrChatNativeTest.chat; export const ChatProvider=({children})=>children; export const errorMessage=error=>error.message || "Could not connect. Please try again.";',
  '@/lib/supabase': 'export const webOrigin="https://chat.example"; export const authCallback="qrchat://auth/callback"; export const providers={google:true}; export const getNativeApi=()=>globalThis.__qrChatNativeTest.nativeApi ?? null;',
  '@/lib/oauth': 'export const completeSignIn=(...args)=>globalThis.__qrChatNativeTest.completeSignIn(...args);',
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
      if ((process.env.QR_CHAT_TEST_COMPILED_ROOM === '1' && url.endsWith('/app/(app)/room.tsx')) || url.endsWith('/hooks/use-direct-messages.ts')) {
        // Exercise the installed Expo compiler too: its dependency extraction can
        // expose nullable accesses and stale reads from mutable stores.
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
      // Native SwiftUI/Compose buttons label themselves with a text child; NativeAction wraps them in an accessible View.
      const wrapper = node => node.type === 'View' && node.props.accessibilityRole === 'button' && !!node.props.onAccessibilityTap;
      const control = tree.root.findAll(node => ['Pressable', 'Button', 'SwiftUIButton', 'ComposeButton'].includes(node.type) || wrapper(node))
        .filter(node => node.props.accessibilityLabel === label || node.props.title === label || node.findAll(text => ['Text', 'SwiftUIText', 'ComposeText'].includes(text.type)).some(text => text.props.children === label))[occurrence];
      if (!control) throw new Error(`Missing button: ${label}`);
      const disabled = control.props.disabled || control.props.enabled === false || control.props.accessibilityState?.disabled || control.props.modifiers?.some(modifier => modifier.$type === 'disabled' && modifier.value);
      if (disabled) throw new Error(`Disabled button: ${label}`);
      await act(async () => { await (control.props.onPress ?? control.props.onClick ?? control.props.onAccessibilityTap)(); });
    },
    async type(label, value) {
      const control = tree.root.findAllByType('NativeTextInput').find(node => node.props.accessibilityLabel === label);
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
